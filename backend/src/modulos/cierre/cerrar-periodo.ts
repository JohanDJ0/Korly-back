import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { periodos } from '../../db/schema/periodos.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { fechaISO } from '../../shared/fechas.js';
import { resolverDecisionesVencidasTx } from './decidir-sobrante.js';
import { generarResumenTx, obtenerResumenTx, type ResumenGenerado } from './generar-resumen.js';
import { drenarACuentaPuenteTx, reclamarArrastresTx } from './materializar-arrastre.js';

/**
 * Default del barrido de sobrante pendiente (modelo-dominio.md §3).
 * Propuesta propia — ver README, sección "Cierre", para la
 * justificación y la advertencia de revisarlo con datos reales.
 */
export const DIAS_DEFAULT_ARRASTRE = 7;

/**
 * Lee `db/schema/periodos.ts` directamente, no el módulo de periodos
 * (`modulos/periodos/crear-periodo.ts`). Es deliberado: ese módulo
 * llama a `resolverPendientesTx` de este archivo para el cierre
 * perezoso, así que este archivo no puede importarlo de vuelta sin
 * crear un ciclo. Mismo patrón que ya usa `ingresos` con el schema del
 * ledger — un módulo de aplicación puede leer/escribir la tabla de otro
 * dominio directamente cuando importar su módulo completo crearía un
 * ciclo; la RLS de la tabla sigue aplicando igual.
 */
export async function cerrarPeriodoManualmente(
  tenantId: string,
  periodoId: string,
  fechaReferencia: Date = new Date()
): Promise<ResumenGenerado> {
  return conTenant(tenantId, async (tx) => {
    const [periodo] = await tx
      .select()
      .from(periodos)
      .where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, periodoId)))
      .limit(1);

    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }

    if (periodo.estado === 'cerrado' || periodo.estado === 'archivado') {
      // Idempotente (invariante 8): cerrar un periodo ya cerrado
      // devuelve su resumen existente, sin generar uno nuevo.
      const resumenExistente = await obtenerResumenTx(tx, tenantId, periodoId);
      if (resumenExistente) return resumenExistente;
      throw new Error(`Periodo ${periodoId} está ${periodo.estado} sin resumen — estado inconsistente`);
    }

    if (periodo.estado !== 'activo') {
      throw new ErrorDominio('PERIODO_NO_ACTIVO', 'Solo se puede cerrar un periodo en estado Activo');
    }

    return cerrarYGenerarResumenTx(tx, tenantId, periodo.id, periodo.cuentaId, fechaReferencia);
  });
}

/**
 * Resuelve, de forma perezosa, lo que quedó pendiente para este tenant:
 * cierra el periodo activo si su `fechaFin` ya pasó, promueve un
 * borrador en espera si ya no queda ningún periodo activo, y aplica el
 * default de arrastre a resúmenes con sobrante pendiente hace más de
 * `DIAS_DEFAULT_ARRASTRE` días. La llama `obtenerPeriodoActivoTx`/
 * `obtenerPeriodoPorIdTx` en modulos/periodos/crear-periodo.ts antes de
 * devolver un periodo — es el único punto de entrada perezoso del
 * tenant, no algo que cada módulo consumidor tenga que recordar llamar
 * por separado (mismo principio que llevó a centralizar `app.tenant_id`
 * en un solo lugar, ADR-005).
 *
 * La promoción de borrador se evalúa siempre que no quede activo — no
 * solo justo después de cerrar uno en esta misma llamada — para cubrir
 * también al tenant que cerró su periodo manualmente
 * (`cerrarPeriodoManualmente`, que no promueve nada por sí mismo,
 * siguiendo el mismo principio perezoso: se resuelve en el siguiente
 * toque real, no de forma eager dentro del cierre).
 */
export async function resolverPendientesTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date = new Date()): Promise<void> {
  const [activo] = await tx
    .select()
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'activo')))
    .limit(1);

  let hayActivo = activo !== undefined;

  if (activo && activo.fechaFin < fechaISO(fechaReferencia)) {
    await cerrarYGenerarResumenTx(tx, tenantId, activo.id, activo.cuentaId, fechaReferencia);
    hayActivo = false;
  }

  if (!hayActivo) {
    await promoverBorradorSiExisteTx(tx, tenantId, fechaReferencia);
  }

  await resolverDecisionesVencidasTx(tx, tenantId, DIAS_DEFAULT_ARRASTRE, fechaReferencia);
}

/**
 * modelo-dominio.md §3: Borrador existe para que el usuario configure
 * el periodo siguiente con anticipación mientras el actual sigue
 * activo, y transiciona a Activo "automática al llegar la fecha de
 * inicio". Promueve solo si HOY está genuinamente dentro de la ventana
 * del borrador (`fechaInicio <= hoy <= fechaFin`) — no basta con
 * `fechaInicio <= hoy`. Con el mecanismo actual de creación de
 * periodos, un borrador casi siempre comparte fechas con el periodo
 * que estaba activo cuando se creó (ver README, "Higiene de
 * borradores"); si además `fechaFin` ya pasó, promoverlo lo activaría
 * ya vencido, y el siguiente toque lo cerraría de inmediato generando
 * un resumen sin ninguna actividad real — churn, no valor. Un borrador
 * cuya ventana completa ya quedó atrás simplemente no se promueve
 * (queda huérfano, ver README).
 *
 * Si hay más de un borrador candidato (no hay restricción única sobre
 * `estado = 'borrador'`, a diferencia de `'activo'`), se promueve el de
 * `fechaInicio` más próxima y, en empate, el más antiguo — los demás
 * quedan como estaban.
 */
async function promoverBorradorSiExisteTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date): Promise<void> {
  const hoy = fechaISO(fechaReferencia);

  const [borrador] = await tx
    .select()
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'borrador'), lte(periodos.fechaInicio, hoy), gte(periodos.fechaFin, hoy)))
    .orderBy(asc(periodos.fechaInicio), asc(periodos.creadoEn))
    .limit(1);

  if (!borrador) return;

  await tx.update(periodos).set({ estado: 'activo' }).where(eq(periodos.id, borrador.id));
  await reclamarArrastresTx(tx, tenantId, borrador.id, borrador.cuentaId, fechaReferencia);
}

/**
 * Marca el periodo cerrado, genera su resumen, Y drena el sobrante (o
 * déficit) hacia la cuenta `arrastre_pendiente` del tenant — las tres
 * cosas en la misma transacción, porque son un solo evento de negocio
 * ("cerrar") visto desde tres tablas distintas. El drenado ocurre aquí
 * y solo aquí, nunca después: es la única forma de mover dinero fuera
 * de la cuenta de un periodo cerrado sin violar la invariante 5 ("un
 * periodo cerrado no cambia de saldo nunca") — si esperáramos a que
 * exista el periodo siguiente para drenar, estaríamos modificando el
 * saldo de un periodo ya cerrado después de cerrado. Ver
 * modulos/cierre/materializar-arrastre.ts para el resto del mecanismo.
 */
async function cerrarYGenerarResumenTx(
  tx: Ejecutor,
  tenantId: string,
  periodoId: string,
  cuentaId: string,
  fechaReferencia: Date
): Promise<ResumenGenerado> {
  await tx.update(periodos).set({ estado: 'cerrado' }).where(eq(periodos.id, periodoId));
  const resumen = await generarResumenTx(tx, tenantId, periodoId, cuentaId, fechaReferencia);
  await drenarACuentaPuenteTx(tx, tenantId, resumen, cuentaId, fechaReferencia);
  return resumen;
}
