import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../../src/app.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { supabaseAdmin } from '../../src/shared/supabase-admin.js';
import {
  cancelarAvisoPro,
  solicitarAvisoPro,
  crearSesionCheckout,
  crearSesionPortal,
  obtenerEstadoSuscripcion,
  procesarEventoStripe,
  type ClienteStripeSuscripciones,
} from '../../src/modulos/suscripciones/suscripciones.js';

// Ids de Price de mentira, fijados aquí y no leídos de backend/.env: el CI no tiene .env, y en una máquina de
// desarrollo el .env trae los Price reales de la cuenta de Stripe — la prueba no debe depender de ninguno de los dos.
// Asignación incondicional a propósito (no `??=`), para que un valor real nunca se cuele.
process.env.STRIPE_PRICE_MENSUAL = 'price_test_mensual';
process.env.STRIPE_PRICE_ANUAL = 'price_test_anual';

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
    it('un tenant nuevo está en free, sin estado de suscripción ni aviso de Pro pedido', async () => {
      const tenantId = await tenantNuevo();
      expect(await obtenerEstadoSuscripcion(tenantId)).toEqual({
        plan: 'free',
        estadoSuscripcion: null,
        suscripcionVigenteHasta: null,
        avisoProSolicitadoEn: null,
        cobrosHabilitados: false,
      });
    });
  });

  describe('cobros apagados (Korly Pro "próximamente")', () => {
    const anterior = process.env.COBROS_HABILITADOS;
    afterEach(() => {
      if (anterior === undefined) delete process.env.COBROS_HABILITADOS;
      else process.env.COBROS_HABILITADOS = anterior;
    });

    it('el estado informa si los cobros están habilitados, según COBROS_HABILITADOS', async () => {
      const tenantId = await tenantNuevo();

      delete process.env.COBROS_HABILITADOS;
      expect((await obtenerEstadoSuscripcion(tenantId)).cobrosHabilitados).toBe(false);
      process.env.COBROS_HABILITADOS = 'false';
      expect((await obtenerEstadoSuscripcion(tenantId)).cobrosHabilitados).toBe(false);
      process.env.COBROS_HABILITADOS = 'true';
      expect((await obtenerEstadoSuscripcion(tenantId)).cobrosHabilitados).toBe(true);
    });

    it('pedir el aviso guarda la fecha; pedirlo otra vez conserva la primera; cancelarlo la borra', async () => {
      const tenantId = await tenantNuevo();

      const primera = await solicitarAvisoPro(tenantId);
      expect(Date.parse(primera.avisoProSolicitadoEn)).toBeGreaterThan(0);
      expect((await obtenerEstadoSuscripcion(tenantId)).avisoProSolicitadoEn).toBe(primera.avisoProSolicitadoEn);

      await new Promise((resolver) => setTimeout(resolver, 15));
      const segunda = await solicitarAvisoPro(tenantId);
      expect(segunda.avisoProSolicitadoEn).toBe(primera.avisoProSolicitadoEn);

      await cancelarAvisoPro(tenantId);
      expect((await obtenerEstadoSuscripcion(tenantId)).avisoProSolicitadoEn).toBeNull();
      await expect(cancelarAvisoPro(tenantId)).resolves.toBeUndefined(); // cancelar lo que no existe no es un error
    });

    it('el aviso de un usuario no toca el de otro (RLS)', async () => {
      const [a, b] = [await tenantNuevo(), await tenantNuevo()];

      await solicitarAvisoPro(a);

      expect((await obtenerEstadoSuscripcion(b)).avisoProSolicitadoEn).toBeNull();
    });

    describe('por HTTP', () => {
      const abiertas: ReturnType<typeof crearApp>[] = [];
      const autenticado = () => {
        vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({ data: { user: { id: `test-cobros-${randomUUID()}` } }, error: null } as never);
        const app = crearApp({ logger: false });
        abiertas.push(app);
        return app;
      };
      const auth = { authorization: 'Bearer token-valido' };

      afterEach(async () => {
        vi.restoreAllMocks();
        await Promise.all(abiertas.splice(0).map((app) => app.close()));
      });

      it('con los cobros apagados, el checkout responde 403 COBROS_NO_DISPONIBLES sin llegar a Stripe', async () => {
        delete process.env.COBROS_HABILITADOS;

        const respuesta = await autenticado().inject({
          method: 'POST',
          url: '/v1/suscripcion/checkout',
          headers: { ...auth, 'content-type': 'application/json' },
          payload: JSON.stringify({ intervalo: 'mensual' }),
        });

        expect(respuesta.statusCode).toBe(403);
        expect(respuesta.json()).toMatchObject({ codigo: 'COBROS_NO_DISPONIBLES' });
      });

      it('con los cobros apagados, el portal también responde 403, aunque el cuerpo ni se valide', async () => {
        delete process.env.COBROS_HABILITADOS;

        const respuesta = await autenticado().inject({ method: 'POST', url: '/v1/suscripcion/portal', headers: auth });

        expect(respuesta.statusCode).toBe(403);
        expect(respuesta.json()).toMatchObject({ codigo: 'COBROS_NO_DISPONIBLES' });
      });

      it('con los cobros prendidos, el checkout ya no se corta por la bandera (aquí falla por otra cosa: cuerpo inválido)', async () => {
        process.env.COBROS_HABILITADOS = 'true';

        const respuesta = await autenticado().inject({ method: 'POST', url: '/v1/suscripcion/checkout', headers: { ...auth, 'content-type': 'application/json' }, payload: '{}' });

        expect(respuesta.statusCode).toBe(400);
        expect(respuesta.json()).toMatchObject({ codigo: 'VALIDACION' });
      });

      it('POST y DELETE /suscripcion/aviso-pro, y el estado los refleja', async () => {
        delete process.env.COBROS_HABILITADOS;
        const app = autenticado();

        const pedido = await app.inject({ method: 'POST', url: '/v1/suscripcion/aviso-pro', headers: auth });
        expect(pedido.statusCode).toBe(200);
        expect(pedido.json()).toEqual({ avisoProSolicitadoEn: expect.any(String) });

        const estado = await app.inject({ method: 'GET', url: '/v1/suscripcion', headers: auth });
        expect(estado.json()).toMatchObject({ cobrosHabilitados: false, avisoProSolicitadoEn: pedido.json().avisoProSolicitadoEn });

        const cancelado = await app.inject({ method: 'DELETE', url: '/v1/suscripcion/aviso-pro', headers: auth });
        expect(cancelado.statusCode).toBe(204);

        const despues = await app.inject({ method: 'GET', url: '/v1/suscripcion', headers: auth });
        expect(despues.json()).toMatchObject({ avisoProSolicitadoEn: null });
      });

      it('sin sesión, el aviso responde 401', async () => {
        const app = crearApp({ logger: false });
        abiertas.push(app);

        expect((await app.inject({ method: 'POST', url: '/v1/suscripcion/aviso-pro' })).statusCode).toBe(401);
        expect((await app.inject({ method: 'DELETE', url: '/v1/suscripcion/aviso-pro' })).statusCode).toBe(401);
      });
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
