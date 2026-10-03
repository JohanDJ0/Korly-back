import { eq } from 'drizzle-orm';
import { tenants } from '../../db/schema/tenants.js';
import { conTenant } from '../../shared/db.js';
import { obtenerCorreoTenantTx, type ResolverCorreo } from '../../shared/correo-tenant.js';
import { TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA } from './tablas-tenant.js';

export interface DatosCuentaExportados {
  version: 1;
  generadoEn: string;
  /** El correo no vive en la base propia (ADR-003): se le pregunta a Supabase Auth. */
  cuenta: { correo: string | null } & Record<string, unknown>;
  /** Una entrada por tabla con `tenant_id`, con todas sus filas tal como están guardadas. */
  datos: Record<string, unknown[]>;
}

/**
 * Derecho de **acceso** (ARCO): todo lo que Korly guarda de un usuario, en
 * un JSON que se puede leer y llevar a otro lado. Gratis para todos los
 * planes — a diferencia de la exportación CSV de gastos/ingresos
 * (modulos/exportar/), que es una función Pro: poder ver tus propios
 * datos no es una función de pago.
 *
 * Recorre la misma lista de tablas que usa la eliminación de cuenta
 * (`tablas-tenant.ts`), al revés (padres primero, para que el JSON se
 * lea en un orden natural), y va por `conTenant`/RLS como cualquier
 * request: nunca puede leer filas de otro tenant.
 */
export async function exportarDatosCuenta(tenantId: string, resolverCorreo?: ResolverCorreo): Promise<DatosCuentaExportados> {
  return conTenant(tenantId, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new Error('El tenant de la sesión no existe');

    const correo = await obtenerCorreoTenantTx(tx, tenantId, resolverCorreo);

    const datos: Record<string, unknown[]> = {};
    for (const { nombre, tabla, columnaTenant } of [...TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA].reverse()) {
      datos[nombre] = await tx.select().from(tabla).where(eq(columnaTenant, tenantId));
    }

    return { version: 1, generadoEn: new Date().toISOString(), cuenta: { correo, ...tenant }, datos };
  });
}

/** Los montos son `bigint` (ADR-002) y `JSON.stringify` no los serializa solo; como texto no pierden precisión. */
export function serializarDatosCuenta(datos: DatosCuentaExportados): string {
  return JSON.stringify(datos, (_clave, valor) => (typeof valor === 'bigint' ? valor.toString() : valor), 2);
}
