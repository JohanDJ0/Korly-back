import { and, eq } from 'drizzle-orm';
import { periodos } from '../../db/schema/periodos.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { resolverDecisionesVencidasTx } from './decidir-sobrante.js';
import { generarResumenTx, obtenerResumenTx, type ResumenGenerado } from './generar-resumen.js';

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
 * cierra el periodo activo si su `fechaFin` ya pasó, y aplica el
 * default de arrastre a resúmenes con sobrante pendiente hace más de
 * `DIAS_DEFAULT_ARRASTRE` días. La llama `obtenerPeriodoActivoTx`/
 * `obtenerPeriodoPorIdTx` en modulos/periodos/crear-periodo.ts antes de
 * devolver un periodo — es el único punto de entrada perezoso del
 * tenant, no algo que cada módulo consumidor tenga que recordar llamar
 * por separado (mismo principio que llevó a centralizar `app.tenant_id`
 * en un solo lugar, ADR-005).
 */
export async function resolverPendientesTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date = new Date()): Promise<void> {
  const [activo] = await tx
    .select()
    .from(periodos)
    .where(and(eq(periodos.tenantId, tenantId), eq(periodos.estado, 'activo')))
    .limit(1);

  if (activo && activo.fechaFin < fechaISO(fechaReferencia)) {
    await cerrarYGenerarResumenTx(tx, tenantId, activo.id, activo.cuentaId, fechaReferencia);
  }

  await resolverDecisionesVencidasTx(tx, tenantId, DIAS_DEFAULT_ARRASTRE, fechaReferencia);
}

async function cerrarYGenerarResumenTx(
  tx: Ejecutor,
  tenantId: string,
  periodoId: string,
  cuentaId: string,
  fechaReferencia: Date
): Promise<ResumenGenerado> {
  await tx.update(periodos).set({ estado: 'cerrado' }).where(eq(periodos.id, periodoId));
  return generarResumenTx(tx, tenantId, periodoId, cuentaId, fechaReferencia);
}

function fechaISO(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
