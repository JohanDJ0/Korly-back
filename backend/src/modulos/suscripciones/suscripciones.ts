import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { tenants, type EstadoSuscripcion, type Plan } from '../../db/schema/tenants.js';
import { eventosWebhookStripe } from '../../db/schema/suscripciones.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { dbAdmin } from '../../shared/db-admin.js';
import { ErrorDominio } from '../../shared/errores.js';
import { obtenerCorreoTenantTx, type ResolverCorreo } from '../../shared/correo-tenant.js';
import { stripe as stripeReal, obtenerPreciosSuscripcion } from '../../shared/stripe.js';

export type Intervalo = 'mensual' | 'anual';

/**
 * Trial de 21 días — punto medio del rango 17–30 que
 * documento-maestro-v2.md §9.3 recomienda a partir de la evidencia de
 * Adapty/RevenueCat citada ahí. Vive en el `subscription_data` del
 * Checkout, no como campo propio: Stripe ya calcula solo cuándo termina
 * y en qué momento empieza a cobrar, y el estado `trialing` llega por el
 * mismo webhook que todo lo demás (ver `webhook.ts`).
 */
const DIAS_DE_PRUEBA = 21;

/**
 * Subconjunto real del SDK de Stripe que este módulo necesita — nunca
 * el cliente completo, mismo criterio que `ResolverCorreo`: los tests
 * pasan un stub que solo implementa esto, y nunca llaman a Stripe de
 * verdad (`scripts/test-local.ts` fuerza `STRIPE_SECRET_KEY` vacío).
 */
export interface ClienteStripeSuscripciones {
  customers: { create: (params: Stripe.CustomerCreateParams) => Promise<{ id: string }> };
  checkout: {
    sessions: { create: (params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }> };
  };
  billingPortal: {
    sessions: { create: (params: Stripe.BillingPortal.SessionCreateParams) => Promise<{ url: string }> };
  };
}

function requerirClienteStripe(clienteInyectado?: ClienteStripeSuscripciones): ClienteStripeSuscripciones {
  const cliente = clienteInyectado ?? stripeReal;
  if (!cliente) throw new Error('Falta STRIPE_SECRET_KEY en el entorno');
  return cliente;
}

/**
 * Crea el Customer de Stripe la primera vez que un tenant intenta
 * pagar, y lo reutiliza siempre después — nunca uno nuevo por intento
 * de checkout (Stripe cobraría bien igual, pero el histórico de pagos
 * del usuario quedaría fragmentado entre varios Customers).
 */
async function obtenerOcrearClienteStripeTx(tx: Ejecutor, tenantId: string, cliente: ClienteStripeSuscripciones, resolverCorreo?: ResolverCorreo): Promise<string> {
  const [fila] = await tx.select({ stripeCustomerId: tenants.stripeCustomerId }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!fila) throw new Error('El tenant de la sesión no existe');
  if (fila.stripeCustomerId) return fila.stripeCustomerId;

  const correo = await obtenerCorreoTenantTx(tx, tenantId, resolverCorreo);
  const customer = await cliente.customers.create(correo ? { email: correo } : {});

  await tx.update(tenants).set({ stripeCustomerId: customer.id }).where(eq(tenants.id, tenantId));
  return customer.id;
}

export interface CrearCheckoutEntrada {
  tenantId: string;
  intervalo: Intervalo;
  urlExito: string;
  urlCancelado: string;
  cliente?: ClienteStripeSuscripciones;
  resolverCorreo?: ResolverCorreo;
}

export async function crearSesionCheckout(entrada: CrearCheckoutEntrada): Promise<{ url: string }> {
  const cliente = requerirClienteStripe(entrada.cliente);
  const precios = obtenerPreciosSuscripcion();
  const price = entrada.intervalo === 'mensual' ? precios.mensual : precios.anual;

  return conTenant(entrada.tenantId, async (tx) => {
    const customerId = await obtenerOcrearClienteStripeTx(tx, entrada.tenantId, cliente, entrada.resolverCorreo);

    const sesion = await cliente.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_period_days: DIAS_DE_PRUEBA },
      success_url: entrada.urlExito,
      cancel_url: entrada.urlCancelado,
    });

    if (!sesion.url) throw new Error('Stripe no devolvió una URL de checkout');
    return { url: sesion.url };
  });
}

export interface CrearPortalEntrada {
  tenantId: string;
  urlRetorno: string;
  cliente?: ClienteStripeSuscripciones;
}

/**
 * Portal de facturación de Stripe — cancelar, cambiar método de pago,
 * ver facturas. Nada de eso se construye a mano aquí: Stripe ya lo
 * resuelve como una página hospedada por ellos.
 */
export async function crearSesionPortal(entrada: CrearPortalEntrada): Promise<{ url: string }> {
  const cliente = requerirClienteStripe(entrada.cliente);

  return conTenant(entrada.tenantId, async (tx) => {
    const [fila] = await tx.select({ stripeCustomerId: tenants.stripeCustomerId }).from(tenants).where(eq(tenants.id, entrada.tenantId)).limit(1);
    if (!fila?.stripeCustomerId) {
      throw new ErrorDominio('SIN_SUSCRIPCION', 'Todavía no tienes una suscripción — actualízate a Pro primero');
    }

    const sesion = await cliente.billingPortal.sessions.create({ customer: fila.stripeCustomerId, return_url: entrada.urlRetorno });
    return { url: sesion.url };
  });
}

export interface EstadoSuscripcionDto {
  plan: Plan;
  estadoSuscripcion: EstadoSuscripcion | null;
  suscripcionVigenteHasta: string | null;
}

export async function obtenerEstadoSuscripcion(tenantId: string): Promise<EstadoSuscripcionDto> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ plan: tenants.plan, estadoSuscripcion: tenants.estadoSuscripcion, suscripcionVigenteHasta: tenants.suscripcionVigenteHasta })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!fila) throw new Error('El tenant de la sesión no existe');
    return { ...fila, suscripcionVigenteHasta: fila.suscripcionVigenteHasta?.toISOString() ?? null };
  });
}

/**
 * Traduce el `status` de una Subscription de Stripe al estado propio
 * (documento-maestro-v2.md §14, F3). `incomplete`/`incomplete_expired`
 * antes de la primera confirmación de pago y `paused` no dan Pro —
 * ninguno de los dos significa "está pagando", así que caen al mismo
 * default que un tenant que nunca ha empezado un checkout.
 */
function mapearEstadoStripe(status: Stripe.Subscription.Status): { plan: Plan; estado: EstadoSuscripcion | null } {
  switch (status) {
    case 'trialing':
      return { plan: 'pro', estado: 'trialing' };
    case 'active':
      return { plan: 'pro', estado: 'activa' };
    case 'past_due':
    case 'unpaid':
      // Dunning: Stripe ya está reintentando el cobro solo (Smart
      // Retries) — el acceso Pro se mantiene durante la gracia; si los
      // reintentos se agotan, Stripe cancela la suscripción y dispara
      // `customer.subscription.deleted`, que sí degrada a free.
      return { plan: 'pro', estado: 'pago_pendiente' };
    case 'canceled':
    case 'incomplete_expired':
      return { plan: 'free', estado: 'cancelada' };
    default:
      return { plan: 'free', estado: null };
  }
}

export const EVENTOS_SUSCRIPCION_MANEJADOS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'] as const;

/**
 * Único punto que el webhook llama tras verificar la firma
 * (`webhook.ts`). Usa `dbAdmin` a propósito — ver el comentario nuevo en
 * `shared/db-admin.ts`: el evento no trae `app.tenant_id`, el primer
 * paso es justo encontrar al tenant por `stripeCustomerId`.
 *
 * Idempotente vía `eventos_webhook_stripe`: Stripe garantiza *al menos
 * una* entrega, nunca exactamente una — sin este chequeo, un mismo
 * evento reenviado podría procesarse dos veces (inofensivo aquí porque
 * cada rama es un `UPDATE` idempotente en sí mismo, pero registrar el
 * evento deja además un historial auditable de qué se procesó y cuándo).
 */
export async function procesarEventoStripe(evento: Stripe.Event): Promise<{ procesado: boolean }> {
  const [reclamado] = await dbAdmin.insert(eventosWebhookStripe).values({ id: evento.id, tipo: evento.type }).onConflictDoNothing().returning({ id: eventosWebhookStripe.id });
  if (!reclamado) return { procesado: false };

  if ((EVENTOS_SUSCRIPCION_MANEJADOS as readonly string[]).includes(evento.type)) {
    const suscripcion = evento.data.object as Stripe.Subscription;
    const customerId = typeof suscripcion.customer === 'string' ? suscripcion.customer : suscripcion.customer.id;
    const { plan, estado } =
      evento.type === 'customer.subscription.deleted' ? { plan: 'free' as const, estado: 'cancelada' as const } : mapearEstadoStripe(suscripcion.status);
    // `current_period_end` vive en cada item de la suscripción desde la
    // versión de API de este SDK, ya no en la suscripción misma — con un
    // solo Price por suscripción (ver `crearSesionCheckout`), el primer
    // item siempre es el que importa.
    const vigenteHasta = suscripcion.items.data[0]?.current_period_end;

    await dbAdmin
      .update(tenants)
      .set({
        plan,
        estadoSuscripcion: estado,
        stripeSubscriptionId: suscripcion.id,
        suscripcionVigenteHasta: vigenteHasta ? new Date(vigenteHasta * 1000) : null,
      })
      .where(eq(tenants.stripeCustomerId, customerId));
  }

  return { procesado: true };
}
