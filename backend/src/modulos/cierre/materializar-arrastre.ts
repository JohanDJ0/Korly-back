import { and, eq, isNull } from 'drizzle-orm';
import { arrastres } from '../../db/schema/arrastres.js';
import { resumenes } from '../../db/schema/cierre.js';
import { cuentas } from '../../db/schema/ledger.js';
import { crearCuentaTx, registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import type { Ejecutor } from '../../shared/db.js';
import { esViolacionDeIndiceUnico } from '../../shared/errores.js';
import { fechaISO } from '../../shared/fechas.js';
import type { ResumenGenerado } from './generar-resumen.js';

/**
 * Drena el sobrante/déficit de un periodo recién cerrado hacia la
 * cuenta `arrastre_pendiente` del tenant (find-or-create), y deja un
 * registro en `arrastres` para que un periodo futuro pueda reclamarlo
 * — ver `reclamarArrastresTx` más abajo para por qué no se reclama de
 * inmediato.
 *
 * Se llama SIEMPRE al cerrar (`cerrar-periodo.ts`), sin importar si la
 * decisión de sobrante ya se resolvió o sigue `'pendiente'` — es la
 * única oportunidad de mover dinero fuera de la cuenta del periodo que
 * cierra sin violar la invariante 5 más tarde.
 *
 * Si el sobrante es exactamente 0, no hay nada que mover ni que
 * registrar.
 */
export async function drenarACuentaPuenteTx(
  tx: Ejecutor,
  tenantId: string,
  resumen: ResumenGenerado,
  cuentaOrigenId: string,
  fechaReferencia: Date
): Promise<void> {
  if (resumen.sobranteValorMinimo === 0n) return;

  const cuentaPuente = await obtenerOCrearCuentaArrastrePendienteTx(tx, tenantId);

  const { movimientoId } = await registrarMovimientoTx(tx, {
    tenantId,
    tipo: 'arrastre_sobrante',
    moneda: resumen.moneda,
    fechaEfectiva: fechaISO(fechaReferencia),
    nota: `Arrastre del periodo ${resumen.periodoId} al cerrar`,
    partidas: [
      { cuentaId: cuentaOrigenId, montoValorMinimo: -resumen.sobranteValorMinimo },
      { cuentaId: cuentaPuente.id, montoValorMinimo: resumen.sobranteValorMinimo },
    ],
  });

  await tx.insert(arrastres).values({
    tenantId,
    resumenId: resumen.id,
    periodoOrigenId: resumen.periodoId,
    montoValorMinimo: resumen.sobranteValorMinimo,
    moneda: resumen.moneda,
    movimientoEntradaId: movimientoId,
  });
}

/**
 * Reclama, hacia el periodo recién creado, todos los arrastres de este
 * tenant que ya están DECIDIDOS como `'arrastrado'` y siguen sin
 * reclamarse. Deliberadamente NO reclama arrastres cuyo resumen sigue
 * `'pendiente'`: hacerlo adelantaría una decisión que el usuario no ha
 * tomado — si más tarde elige `'ahorrar'` (cuando exista Metas), ese
 * dinero nunca debió aparecer ya disponible en este periodo.
 *
 * `tenantId` va explícito en el `WHERE` de la consulta y del `UPDATE`
 * de reclamo — no solo se confía en que RLS lo filtre por debajo.
 * Mismo criterio que ya se aplicó a `periodoId` en ingresos/gastos:
 * ver test/integracion/cierre.test.ts para el caso donde un tenant
 * intenta reclamar arrastres de otro.
 *
 * Reclama todos los que apliquen, no solo el más reciente: si el
 * usuario se saltó crear un periodo por un tiempo, pueden haberse
 * acumulado varios arrastres sin reclamar.
 */
export async function reclamarArrastresTx(
  tx: Ejecutor,
  tenantId: string,
  periodoDestinoId: string,
  cuentaDestinoId: string,
  fechaReferencia: Date
): Promise<void> {
  const elegibles = await tx
    .select({
      id: arrastres.id,
      montoValorMinimo: arrastres.montoValorMinimo,
      moneda: arrastres.moneda,
    })
    .from(arrastres)
    .innerJoin(resumenes, eq(arrastres.resumenId, resumenes.id))
    .where(
      and(
        eq(arrastres.tenantId, tenantId),
        isNull(arrastres.periodoDestinoId),
        eq(resumenes.decisionSobrante, 'arrastrado')
      )
    );

  if (elegibles.length === 0) return;

  const [cuentaPuente] = await tx
    .select({ id: cuentas.id })
    .from(cuentas)
    .where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.tipo, 'arrastre_pendiente')))
    .limit(1);
  if (!cuentaPuente) {
    throw new Error(`Tenant ${tenantId} tiene arrastres elegibles pero no tiene cuenta arrastre_pendiente — estado inconsistente`);
  }

  for (const elegible of elegibles) {
    // UPDATE ... WHERE periodo_destino_id is null: reserva la fila.
    // Si una transacción concurrente ya la reclamó, esto afecta 0 filas
    // y se salta sin crear un movimiento — mismo patrón de guarda que
    // decidirSobrante.
    const [reservado] = await tx
      .update(arrastres)
      .set({ periodoDestinoId })
      .where(and(eq(arrastres.id, elegible.id), eq(arrastres.tenantId, tenantId), isNull(arrastres.periodoDestinoId)))
      .returning({ id: arrastres.id });

    if (!reservado) continue;

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId,
      tipo: 'arrastre_sobrante',
      moneda: elegible.moneda,
      fechaEfectiva: fechaISO(fechaReferencia),
      nota: `Arrastre reclamado por el periodo ${periodoDestinoId}`,
      partidas: [
        { cuentaId: cuentaPuente.id, montoValorMinimo: -elegible.montoValorMinimo },
        { cuentaId: cuentaDestinoId, montoValorMinimo: elegible.montoValorMinimo },
      ],
    });

    await tx.update(arrastres).set({ movimientoSalidaId: movimientoId }).where(eq(arrastres.id, elegible.id));
  }
}

/**
 * Find-or-create con el mismo patrón de `SAVEPOINT` + reintento que ya
 * usa `crearPeriodo` para el periodo activo — el índice único parcial
 * en `cuentas` (`cuentas_una_arrastre_pendiente_por_tenant`) es la
 * autoridad real, no esta comprobación.
 */
async function obtenerOCrearCuentaArrastrePendienteTx(tx: Ejecutor, tenantId: string): Promise<{ id: string }> {
  const [existente] = await tx
    .select({ id: cuentas.id })
    .from(cuentas)
    .where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.tipo, 'arrastre_pendiente')))
    .limit(1);
  if (existente) return existente;

  try {
    return await tx.transaction((tx2) => crearCuentaTx(tx2, tenantId, 'arrastre_pendiente'));
  } catch (error) {
    if (!esViolacionDeIndiceUnico(error)) throw error;

    const [creadaPorOtraTransaccion] = await tx
      .select({ id: cuentas.id })
      .from(cuentas)
      .where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.tipo, 'arrastre_pendiente')))
      .limit(1);
    if (!creadaPorOtraTransaccion) throw error;
    return creadaPorOtraTransaccion;
  }
}
