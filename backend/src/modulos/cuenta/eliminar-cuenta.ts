import { and, eq, sql } from 'drizzle-orm';
import { identidadesExternas } from '../../db/schema/identidad.js';
import { tenants } from '../../db/schema/tenants.js';
import { dbAdmin } from '../../shared/db-admin.js';
import { ErrorDominio } from '../../shared/errores.js';
import { reportarErrorInesperado } from '../../shared/observabilidad.js';
import { stripe } from '../../shared/stripe.js';
import { supabaseAdmin } from '../../shared/supabase-admin.js';
import { TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA } from './tablas-tenant.js';

export const PALABRA_DE_CONFIRMACION = 'ELIMINAR';

/** Subconjunto del SDK de Stripe que usa esta función — mismo criterio que `ClienteStripeSuscripciones`. */
export interface ClienteStripeCuenta {
  customers: { del: (customerId: string) => Promise<unknown> };
}

export interface DependenciasEliminarCuenta {
  /** `null` = sin Stripe configurado. Omitirlo usa el cliente real. */
  clienteStripe?: ClienteStripeCuenta | null;
  eliminarUsuarioAuth?: (idEnProveedor: string) => Promise<void>;
}

export interface ResultadoEliminarCuenta {
  /** `false` si Supabase Auth no pudo borrar al usuario (los datos ya se purgaron) — queda reportado a Sentry. */
  usuarioAuthEliminado: boolean;
}

async function eliminarUsuarioAuthViaSupabase(idEnProveedor: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(idEnProveedor);
  // Un usuario que ya no existe es el estado que se busca, no un fallo.
  if (error && error.status !== 404) throw new Error(error.message);
}

function esRecursoInexistenteDeStripe(error: unknown): boolean {
  return (error as { code?: string })?.code === 'resource_missing';
}

/**
 * Borra TODOS los datos de un tenant en una sola transacción (ADR-008).
 *
 * Usa `dbAdmin` (rol `postgres`) a propósito y fija `app.purga_cuenta`
 * local a la transacción: es la única forma de pasar los triggers de
 * inmutabilidad del ledger (migración 0019), que solo abren el DELETE si
 * se cumplen las dos cosas — declaración explícita Y una sesión que no
 * sea `app_backend`. Todo o nada: si algo falla, no se borra nada.
 *
 * `tenantId` SIEMPRE sale de la identidad ya verificada del request,
 * nunca de un parámetro del cliente.
 */
async function purgarTenant(tenantId: string): Promise<void> {
  await dbAdmin.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.purga_cuenta', 'on', true)`);

    for (const { tabla, columnaTenant } of TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA) {
      await tx.delete(tabla).where(eq(columnaTenant, tenantId));
    }
    await tx.delete(tenants).where(eq(tenants.id, tenantId));
  });
}

/**
 * Derecho de **cancelación** (ARCO). Orden deliberado, del paso más
 * fácil de repetir al más definitivo:
 *
 * 1. **Stripe**: borrar el Customer cancela de inmediato sus suscripciones
 *    activas. Va primero porque si falla se aborta todo con los datos
 *    intactos y el usuario puede reintentar; un Customer ya borrado
 *    (`resource_missing`) no es un error. Stripe conserva sus propias
 *    facturas por obligación fiscal — eso no depende de nosotros.
 * 2. **Purga de la base**, en una transacción.
 * 3. **Supabase Auth**: borrar al usuario (el correo y la contraseña
 *    viven ahí, ADR-003). Si esto falla, los datos ya no existen: el
 *    usuario podría volver a entrar y se le aprovisionaría una cuenta
 *    nueva y vacía — inofensivo, pero se reporta para limpiarlo a mano.
 *
 * La confirmación se exige aquí y no solo en la pantalla: es irreversible.
 */
export async function eliminarCuenta(
  tenantId: string,
  confirmacion: unknown,
  dependencias: DependenciasEliminarCuenta = {}
): Promise<ResultadoEliminarCuenta> {
  if (confirmacion !== PALABRA_DE_CONFIRMACION) {
    throw new ErrorDominio('VALIDACION', `Para eliminar tu cuenta escribe ${PALABRA_DE_CONFIRMACION}`);
  }

  const [tenant] = await dbAdmin
    .select({ stripeCustomerId: tenants.stripeCustomerId, estadoSuscripcion: tenants.estadoSuscripcion })
    .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new ErrorDominio('VALIDACION', 'La cuenta ya no existe');

  const identidades = await dbAdmin
    .select({ idEnProveedor: identidadesExternas.idEnProveedor })
    .from(identidadesExternas)
    .where(and(eq(identidadesExternas.tenantId, tenantId), eq(identidadesExternas.proveedor, 'supabase')));

  if (tenant.stripeCustomerId) {
    const clienteStripe = 'clienteStripe' in dependencias ? dependencias.clienteStripe : stripe;
    if (!clienteStripe) throw new Error('La cuenta tiene un Customer de Stripe pero falta STRIPE_SECRET_KEY para borrarlo');
    try {
      await clienteStripe.customers.del(tenant.stripeCustomerId);
    } catch (error) {
      if (!esRecursoInexistenteDeStripe(error)) throw error;
    }
    // El Customer ya no existe: si la purga de abajo fallara, el tenant no
    // debe quedarse apuntando a él (el siguiente checkout lo reutilizaría y
    // Stripe diría "No such customer"). Queda como una cuenta Free normal.
    await dbAdmin
      .update(tenants)
      .set({ stripeCustomerId: null, stripeSubscriptionId: null, suscripcionVigenteHasta: null, plan: 'free', estadoSuscripcion: tenant.estadoSuscripcion ? 'cancelada' : null })
      .where(eq(tenants.id, tenantId));
  }

  await purgarTenant(tenantId);

  const eliminarUsuarioAuth = dependencias.eliminarUsuarioAuth ?? eliminarUsuarioAuthViaSupabase;
  let usuarioAuthEliminado = true;
  for (const { idEnProveedor } of identidades) {
    try {
      await eliminarUsuarioAuth(idEnProveedor);
    } catch (error) {
      usuarioAuthEliminado = false;
      reportarErrorInesperado(error);
    }
  }

  return { usuarioAuthEliminado };
}
