import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { arrastres } from '../../db/schema/arrastres.js';
import { resumenes } from '../../db/schema/cierre.js';
import { gastos } from '../../db/schema/gastos.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { periodos } from '../../db/schema/periodos.js';
import { revertirMovimientoEnSusCuentasTx } from '../ledger/registrar-movimiento.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { ahoraEnMexico, fechaISO } from '../../shared/fechas.js';
import { esUuidValido } from '../../shared/validacion.js';

function noPermitida(mensaje: string): ErrorDominio {
  return new ErrorDominio('REAPERTURA_NO_PERMITIDA', mensaje);
}

/**
 * Deshace el cierre de un periodo (ADR-009): el usuario cerró por error.
 * Nada se borra del ledger — se agregan reversiones y marcas:
 *
 * 1. Si después del cierre se promovió un periodo (el borrador siguiente
 *    pasa solo a `activo` al cerrar, ver `promoverBorradorSiExisteTx`), se
 *    descarta, pero SOLO si no tiene actividad del usuario: únicamente los
 *    gastos recurrentes y pagos de tarjeta que se materializaron solos.
 *    Si el usuario ya registró algo ahí, se rechaza: no se adivina cómo
 *    mover esos movimientos.
 * 2. Se revierte el drenaje del sobrante (periodo → `arrastre_pendiente`).
 * 3. Se anula el resumen y el periodo vuelve a `activo`.
 *
 * Solo se puede mientras el dinero no haya salido de donde lo dejó el
 * cierre: el sobrante no puede haberse guardado en una meta ni reclamado
 * por otro periodo, y el periodo no puede haber terminado su quincena (el
 * cierre perezoso lo volvería a cerrar en el siguiente request).
 *
 * Lee `periodos` directamente, no `obtenerPeriodoPorIdTx`: esa función
 * dispara el cierre perezoso y la promoción de borradores, justo lo que
 * esta operación no debe provocar a medias.
 */
export async function reabrirPeriodo(tenantId: string, periodoId: string, fechaReferencia: Date = ahoraEnMexico()): Promise<{ periodoId: string }> {
  return conTenant(tenantId, (tx) => reabrirPeriodoTx(tx, tenantId, periodoId, fechaReferencia));
}

/**
 * Variante componible: recibe una transacción ya abierta. Permite ensayar la
 * reapertura sobre datos reales y revertirla (lanzando al final) sin dejar
 * nada, antes de aplicarla de verdad.
 */
export async function reabrirPeriodoTx(tx: Ejecutor, tenantId: string, periodoId: string, fechaReferencia: Date = ahoraEnMexico()): Promise<{ periodoId: string }> {
  if (!esUuidValido(periodoId)) {
    throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
  }

  const [periodo] = await tx
    .select()
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, periodoId)))
    .limit(1);
  if (!periodo) throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');

  if (periodo.estado === 'activo') throw noPermitida('Este periodo ya está abierto.');
  if (periodo.estado !== 'cerrado') throw noPermitida('Solo se puede reabrir un periodo que esté cerrado.');

  const hoy = fechaISO(fechaReferencia);
  if (periodo.fechaFin < hoy) {
    throw noPermitida('La quincena de este periodo ya terminó, así que su cierre es definitivo.');
  }

  const [resumen] = await tx
    .select()
    .from(resumenes)
    .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodo.id), isNull(resumenes.anuladoEn)))
    .limit(1);
  if (!resumen) throw new Error(`Periodo ${periodo.id} está cerrado sin un resumen vigente — estado inconsistente`);

  const [cierreMasReciente] = await tx
    .select({ id: resumenes.id })
    .from(resumenes)
    .where(and(eq(resumenes.tenantId, tenantId), isNull(resumenes.anuladoEn), gt(resumenes.generadoEn, resumen.generadoEn)))
    .limit(1);
  if (cierreMasReciente) throw noPermitida('Hay un cierre más reciente: solo se puede reabrir el último periodo cerrado.');

  if (resumen.decisionSobrante === 'ahorrado') {
    throw noPermitida('El sobrante de este periodo ya se guardó en una meta.');
  }
  const [arrastre] = await tx
    .select()
    .from(arrastres)
    .where(and(eq(arrastres.tenantId, tenantId), eq(arrastres.resumenId, resumen.id)))
    .limit(1);
  if (arrastre && (arrastre.periodoDestinoId !== null || arrastre.metaDestinoId !== null)) {
    throw noPermitida('El sobrante de este periodo ya pasó al periodo siguiente.');
  }

  await descartarPeriodoSiguienteVacioTx(tx, tenantId, periodo.id, hoy);

  if (arrastre) {
    await revertirMovimientoEnSusCuentasTx(tx, tenantId, arrastre.movimientoEntradaId, hoy, `Reapertura del periodo ${periodo.id}: el sobrante vuelve al periodo`);
  }

  const [anulado] = await tx
    .update(resumenes)
    .set({ anuladoEn: fechaReferencia })
    .where(and(eq(resumenes.id, resumen.id), isNull(resumenes.anuladoEn)))
    .returning({ id: resumenes.id });
  if (!anulado) throw noPermitida('El resumen de este periodo ya fue anulado.');

  await tx.update(periodos).set({ estado: 'activo' }).where(eq(periodos.id, periodo.id));

  return { periodoId: periodo.id };
}

/**
 * Si hay otro periodo activo (el borrador que se promovió al cerrar), lo
 * retira — pero solo si todo lo que tiene lo puso el sistema. Revierte sus
 * movimientos automáticos y lo marca `descartado` (no `archivado`: el
 * Historial muestra los archivados, y este es un duplicado sin valor).
 *
 * "Automático" = un gasto que vino de un recurrente, o un pago de tarjeta
 * (ambos se materializan al activarse el periodo). Cualquier otra cosa —un
 * ingreso, un gasto manual, un aporte a meta, un arrastre reclamado, una
 * reversión— es actividad del usuario y bloquea la reapertura.
 */
async function descartarPeriodoSiguienteVacioTx(tx: Ejecutor, tenantId: string, periodoReabiertoId: string, hoy: string): Promise<void> {
  const [siguiente] = await tx
    .select()
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'activo'), ne(periodos.id, periodoReabiertoId)))
    .limit(1);
  if (!siguiente) return;

  const filas = await tx
    .select({ movimientoId: movimientos.id, tipo: movimientos.tipo, origenRecurrenteId: gastos.origenRecurrenteId })
    .from(asientos)
    .innerJoin(movimientos, eq(asientos.movimientoId, movimientos.id))
    .leftJoin(gastos, eq(gastos.movimientoId, movimientos.id))
    .where(and(eq(asientos.tenantId, tenantId), eq(asientos.cuentaId, siguiente.cuentaId)));

  const porMovimiento = new Map<string, { automatico: boolean }>();
  for (const fila of filas) {
    const automatico = (fila.tipo === 'gasto' && fila.origenRecurrenteId !== null) || fila.tipo === 'pago_tarjeta';
    porMovimiento.set(fila.movimientoId, { automatico });
  }

  const propios = [...porMovimiento.values()].filter((m) => !m.automatico).length;
  if (propios > 0) {
    throw noPermitida(
      `El periodo que se abrió después del cierre ya tiene ${propios === 1 ? 'un movimiento tuyo' : `${propios} movimientos tuyos`}. ` +
        'Bórralos o muévelos antes de reabrir el periodo anterior.'
    );
  }

  for (const [movimientoId] of porMovimiento) {
    await revertirMovimientoEnSusCuentasTx(tx, tenantId, movimientoId, hoy, `Reapertura del periodo ${periodoReabiertoId}: se retira el periodo duplicado`);
  }
  await tx.update(periodos).set({ estado: 'descartado' }).where(eq(periodos.id, siguiente.id));
}
