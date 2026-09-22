import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import {
  crearSesionCheckout,
  crearSesionPortal,
  obtenerEstadoSuscripcion,
  procesarEventoStripe,
  type ClienteStripeSuscripciones,
} from '../../src/modulos/suscripciones/suscripciones.js';

describe('suscripciones', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-suscripciones-${randomUUID()}`);
    return tenantId;
  }

  const correoDePrueba = async () => 'usuario@ejemplo.com';

  /**
   * Nunca debe llamar a Stripe de verdad en tests — ver
   * scripts/test-local.ts (`STRIPE_SECRET_KEY: ''`). El id de Customer
   * usa `randomUUID()`, no un contador secuencial: `stripeCustomerId` es
   * único a nivel de tabla `tenants` en toda la suite, y un contador que
   * reinicia en 1 en cada llamada a este helper chocaría entre tests
   * distintos que crean su propio tenant.
   */
  function clienteStripeDePrueba() {
    const customersCreados: string[] = [];
    const cliente: ClienteStripeSuscripciones = {
      customers: {
        create: async () => {
          const id = `cus_test_${randomUUID()}`;
          customersCreados.push(id);
          return { id };
        },
      },
      checkout: {
        sessions: { create: async () => ({ url: 'https://checkout.stripe.com/test-session' }) },
      },
      billingPortal: {
        sessions: { create: async () => ({ url: 'https://billing.stripe.com/test-portal' }) },
      },
    };
    return { cliente, customersCreados: () => customersCreados };
  }

  function eventoSuscripcion(tipo: Stripe.Event['type'], datos: { id: string; customer: string; status: Stripe.Subscription.Status; currentPeriodEnd: number }): Stripe.Event {
    return {
      id: `evt_${randomUUID()}`,
      type: tipo,
      data: {
        object: {
          id: datos.id,
          customer: datos.customer,
          status: datos.status,
          items: { data: [{ current_period_end: datos.currentPeriodEnd }] },
        },
      },
    } as unknown as Stripe.Event;
  }

  describe('crearSesionCheckout', () => {
    it('crea el Customer de Stripe la primera vez y guarda el id en el tenant', async () => {
      const tenantId = await tenantNuevo();
      const { cliente, customersCreados } = clienteStripeDePrueba();

      const sesion = await crearSesionCheckout({
        tenantId,
        intervalo: 'mensual',
        urlExito: 'https://app.korly.com.mx/ajustes?suscripcion=exito',
        urlCancelado: 'https://app.korly.com.mx/ajustes?suscripcion=cancelado',
        cliente,
        resolverCorreo: correoDePrueba,
      });

      expect(sesion.url).toBe('https://checkout.stripe.com/test-session');
      expect(customersCreados()).toHaveLength(1);
    });

    it('reutiliza el mismo Customer en un segundo checkout, no crea uno nuevo', async () => {
      const tenantId = await tenantNuevo();
      const { cliente, customersCreados } = clienteStripeDePrueba();
      const entrada = { tenantId, intervalo: 'mensual' as const, urlExito: 'x', urlCancelado: 'y', cliente, resolverCorreo: correoDePrueba };

      await crearSesionCheckout(entrada);
      await crearSesionCheckout(entrada);

      expect(customersCreados()).toHaveLength(1);
    });
  });

  describe('crearSesionPortal', () => {
    it('rechaza si el tenant nunca ha empezado un checkout', async () => {
      const tenantId = await tenantNuevo();
      const { cliente } = clienteStripeDePrueba();

      await expect(crearSesionPortal({ tenantId, urlRetorno: 'https://app.korly.com.mx/ajustes', cliente })).rejects.toThrow(
        'Todavía no tienes una suscripción'
      );
    });

    it('devuelve la URL del portal una vez que ya existe un Customer', async () => {
      const tenantId = await tenantNuevo();
      const { cliente } = clienteStripeDePrueba();
      await crearSesionCheckout({ tenantId, intervalo: 'anual', urlExito: 'x', urlCancelado: 'y', cliente, resolverCorreo: correoDePrueba });

      const portal = await crearSesionPortal({ tenantId, urlRetorno: 'https://app.korly.com.mx/ajustes', cliente });

      expect(portal.url).toBe('https://billing.stripe.com/test-portal');
    });
  });

  describe('obtenerEstadoSuscripcion', () => {
    it('un tenant nuevo está en free, sin estado de suscripción', async () => {
      const tenantId = await tenantNuevo();
      expect(await obtenerEstadoSuscripcion(tenantId)).toEqual({ plan: 'free', estadoSuscripcion: null, suscripcionVigenteHasta: null });
    });
  });

  describe('procesarEventoStripe (webhook)', () => {
    async function tenantConCustomer(customerId: string) {
      const tenantId = await tenantNuevo();
      const { cliente } = clienteStripeDePrueba();
      // Fuerza el mismo customerId de prueba en vez de uno generado, para
      // poder simular el evento de Stripe apuntando a él.
      const clienteConIdFijo: ClienteStripeSuscripciones = { ...cliente, customers: { create: async () => ({ id: customerId }) } };
      await crearSesionCheckout({ tenantId, intervalo: 'mensual', urlExito: 'x', urlCancelado: 'y', cliente: clienteConIdFijo, resolverCorreo: correoDePrueba });
      return tenantId;
    }

    it('customer.subscription.created en trialing sube el tenant a pro/trialing', async () => {
      const customerId = `cus_${randomUUID()}`;
      const tenantId = await tenantConCustomer(customerId);
      const vigenteHasta = Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60;

      await procesarEventoStripe(eventoSuscripcion('customer.subscription.created', { id: 'sub_1', customer: customerId, status: 'trialing', currentPeriodEnd: vigenteHasta }));

      const estado = await obtenerEstadoSuscripcion(tenantId);
      expect(estado.plan).toBe('pro');
      expect(estado.estadoSuscripcion).toBe('trialing');
      expect(estado.suscripcionVigenteHasta).not.toBeNull();
    });

    it('customer.subscription.updated a past_due deja pago_pendiente sin bajar de pro (dunning)', async () => {
      const customerId = `cus_${randomUUID()}`;
      const tenantId = await tenantConCustomer(customerId);
      const vigenteHasta = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;

      await procesarEventoStripe(eventoSuscripcion('customer.subscription.updated', { id: 'sub_1', customer: customerId, status: 'past_due', currentPeriodEnd: vigenteHasta }));

      const estado = await obtenerEstadoSuscripcion(tenantId);
      expect(estado.plan).toBe('pro');
      expect(estado.estadoSuscripcion).toBe('pago_pendiente');
    });

    it('customer.subscription.deleted baja el tenant a free/cancelada', async () => {
      const customerId = `cus_${randomUUID()}`;
      const tenantId = await tenantConCustomer(customerId);
      await procesarEventoStripe(eventoSuscripcion('customer.subscription.created', { id: 'sub_1', customer: customerId, status: 'active', currentPeriodEnd: 0 }));

      await procesarEventoStripe(eventoSuscripcion('customer.subscription.deleted', { id: 'sub_1', customer: customerId, status: 'canceled', currentPeriodEnd: 0 }));

      const estado = await obtenerEstadoSuscripcion(tenantId);
      expect(estado.plan).toBe('free');
      expect(estado.estadoSuscripcion).toBe('cancelada');
    });

    it('idempotente: el mismo evento reenviado no se procesa dos veces', async () => {
      const customerId = `cus_${randomUUID()}`;
      const tenantId = await tenantConCustomer(customerId);
      const evento = eventoSuscripcion('customer.subscription.created', { id: 'sub_1', customer: customerId, status: 'active', currentPeriodEnd: 0 });

      const primera = await procesarEventoStripe(evento);
      const segunda = await procesarEventoStripe(evento);

      expect(primera).toEqual({ procesado: true });
      expect(segunda).toEqual({ procesado: false });
      expect((await obtenerEstadoSuscripcion(tenantId)).plan).toBe('pro');
    });
  });
});
