import { eq } from 'drizzle-orm';
import { tenants, type Plan } from '../../db/schema/tenants.js';
import type { Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';

/**
 * documento-maestro-v2.md §9.2 — el punto único donde el resto de los
 * módulos preguntan "¿este tenant es Pro?". Nunca cachear el resultado
 * entre requests: mismo criterio que `consultarDisponible`, el plan
 * puede cambiar (una vez que exista el webhook de Stripe) y cada
 * consulta debe reflejar el estado real, no uno de hace rato.
 */
export async function obtenerPlanTenantTx(tx: Ejecutor, tenantId: string): Promise<Plan> {
  const [fila] = await tx.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return fila?.plan ?? 'free';
}

/**
 * Guarda usada por cualquier función exclusiva de Pro (exportación CSV
 * hoy; recordatorios avanzados/alerta de ritmo después). `mensaje` lo
 * decide el llamador porque el texto correcto depende de qué feature
 * es — "la exportación a CSV" no es lo mismo que "la alerta de ritmo".
 */
export async function requerirPlanProTx(tx: Ejecutor, tenantId: string, mensaje: string): Promise<void> {
  const plan = await obtenerPlanTenantTx(tx, tenantId);
  if (plan !== 'pro') {
    throw new ErrorDominio('FUNCION_PRO', mensaje);
  }
}
