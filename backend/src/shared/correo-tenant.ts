import { and, eq } from 'drizzle-orm';
import { identidadesExternas } from '../db/schema/identidad.js';
import { supabaseAdmin } from './supabase-admin.js';
import type { Ejecutor } from './db.js';

/** Firma de "dado el id en Supabase Auth, dame el correo" — ver `resolverCorreoViaSupabase`. */
export type ResolverCorreo = (idEnProveedor: string) => Promise<string | null>;

export async function resolverCorreoViaSupabase(idEnProveedor: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(idEnProveedor);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

/**
 * `usuario_id`/`tenant_id` de `usuarios` ni se tocan aquí — el correo no
 * vive en la base propia (ADR-003: el proveedor de auth es desacoplado),
 * así que la única fuente de verdad es preguntarle a Supabase Auth por el
 * usuario detrás de la identidad externa `'supabase'` de este tenant.
 * `null` si el tenant no tiene ninguna identidad todavía (no debería
 * pasar en la práctica) o si Supabase no devuelve un email.
 *
 * Extraído de `modulos/notificaciones/enviar-recordatorios.ts` — mismo
 * problema exacto lo tiene `modulos/suscripciones/` para crear el
 * Customer de Stripe con el correo real del usuario.
 */
export async function obtenerCorreoTenantTx(tx: Ejecutor, tenantId: string, resolverCorreo: ResolverCorreo = resolverCorreoViaSupabase): Promise<string | null> {
  const [identidad] = await tx
    .select({ idEnProveedor: identidadesExternas.idEnProveedor })
    .from(identidadesExternas)
    .where(and(eq(identidadesExternas.tenantId, tenantId), eq(identidadesExternas.proveedor, 'supabase')))
    .limit(1);
  if (!identidad) return null;

  return resolverCorreo(identidad.idEnProveedor);
}
