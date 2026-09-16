import { eq } from 'drizzle-orm';
import { tenants } from '../../db/schema/tenants.js';
import { conTenant } from '../../shared/db.js';

export async function obtenerPreferenciasNotificaciones(tenantId: string): Promise<{ recibirRecordatorios: boolean }> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx.select({ recibirRecordatorios: tenants.recibirRecordatorios }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!fila) throw new Error('El tenant de la sesión no existe');
    return fila;
  });
}

export async function actualizarPreferenciasNotificaciones(tenantId: string, recibirRecordatorios: boolean): Promise<{ recibirRecordatorios: boolean }> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx.update(tenants).set({ recibirRecordatorios }).where(eq(tenants.id, tenantId)).returning({ recibirRecordatorios: tenants.recibirRecordatorios });
    if (!fila) throw new Error('El tenant de la sesión no existe');
    return fila;
  });
}
