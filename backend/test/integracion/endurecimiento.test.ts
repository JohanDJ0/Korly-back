import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApp, type OpcionesApp } from '../../src/app.js';
import { supabaseAdmin } from '../../src/shared/supabase-admin.js';

describe('endurecimiento de la API', () => {
  const abiertas: ReturnType<typeof crearApp>[] = [];

  /** Cada prueba, su propia app: el contador del límite vive en memoria, por instancia. */
  function nuevaApp(opciones: OpcionesApp = {}) {
    const app = crearApp({ logger: false, ...opciones });
    abiertas.push(app);
    return app;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(abiertas.splice(0).map((app) => app.close()));
  });

  async function estados(app: ReturnType<typeof crearApp>, cantidad: number, peticion: { method: 'GET' | 'POST'; url: string; headers?: Record<string, string>; payload?: string }) {
    const codigos: number[] = [];
    for (let i = 0; i < cantidad; i++) {
      codigos.push((await app.inject(peticion)).statusCode);
    }
    return codigos;
  }

  describe('límite de peticiones', () => {
    it('pasado el límite responde 429 con el formato de error de la API y Retry-After', async () => {
      const app = nuevaApp({ limitePorMinuto: 3 });

      const codigos = await estados(app, 3, { method: 'GET', url: '/v1/me' });
      const excedida = await app.inject({ method: 'GET', url: '/v1/me' });

      expect(codigos).toEqual([401, 401, 401]);
      expect(excedida.statusCode).toBe(429);
      expect(excedida.json()).toMatchObject({ codigo: 'DEMASIADAS_SOLICITUDES' });
      expect(excedida.json().mensaje).toMatch(/Demasiadas solicitudes/);
      expect(excedida.headers['retry-after']).toBeDefined();
    });

    it('el contador global es uno por IP, compartido por todas las rutas', async () => {
      const app = nuevaApp({ limitePorMinuto: 3 });

      await estados(app, 2, { method: 'GET', url: '/v1/me' });
      const otraRuta = await estados(app, 2, { method: 'GET', url: '/v1/suscripcion' });

      expect(otraRuta).toEqual([401, 429]);
    });

    it('una ruta con límite estricto lleva su propio contador: agotar el global no la bloquea', async () => {
      const app = nuevaApp({ limitePorMinuto: 2 });

      await estados(app, 3, { method: 'GET', url: '/v1/me' });

      const eliminar = await app.inject({ method: 'POST', url: '/v1/cuenta/eliminar', headers: { 'content-type': 'application/json' }, payload: '{}' });
      expect(eliminar.statusCode).toBe(401);
    });

    it('los healthchecks nunca se limitan (el orquestador los llama a intervalo fijo)', async () => {
      const app = nuevaApp({ limitePorMinuto: 1 });

      expect(await estados(app, 5, { method: 'GET', url: '/salud' })).toEqual([200, 200, 200, 200, 200]);
      expect(await estados(app, 5, { method: 'GET', url: '/salud/listo' })).toEqual([200, 200, 200, 200, 200]);
    });

    it('el webhook de Stripe tampoco: su defensa es la firma, no el volumen', async () => {
      const app = nuevaApp({ limitePorMinuto: 1 });

      const codigos = await estados(app, 4, { method: 'POST', url: '/v1/webhooks/stripe', headers: { 'content-type': 'application/json' }, payload: '{}' });

      expect(codigos).toEqual([400, 400, 400, 400]); // FIRMA_FALTANTE, nunca 429
    });

    it('eliminar la cuenta tiene un límite propio mucho más estricto (5 por hora), aunque el global sea enorme', async () => {
      const app = nuevaApp({ limitePorMinuto: 1000 });

      const codigos = await estados(app, 6, { method: 'POST', url: '/v1/cuenta/eliminar', headers: { 'content-type': 'application/json' }, payload: '{}' });

      expect(codigos).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('los límites estrictos de datos y de Stripe también existen', async () => {
      const app = nuevaApp({ limitePorMinuto: 1000 });

      expect(await estados(app, 11, { method: 'GET', url: '/v1/cuenta/datos' })).toEqual([...Array<number>(10).fill(401), 429]);
      expect(await estados(app, 11, { method: 'POST', url: '/v1/suscripcion/checkout', headers: { 'content-type': 'application/json' }, payload: '{}' })).toEqual([
        ...Array<number>(10).fill(401),
        429,
      ]);
    });

    describe('X-Forwarded-For', () => {
      it('sin trustProxy se ignora: falsear la cabecera no sirve para esquivar el límite', async () => {
        const app = nuevaApp({ limitePorMinuto: 2, trustProxy: false });

        const codigos: number[] = [];
        for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
          codigos.push((await app.inject({ method: 'GET', url: '/v1/me', headers: { 'x-forwarded-for': ip } })).statusCode);
        }

        expect(codigos).toEqual([401, 401, 429]);
      });

      it('con trustProxy cada IP real tiene su propio contador (detrás de un proxy, no comparten el de todos)', async () => {
        const app = nuevaApp({ limitePorMinuto: 2, trustProxy: true });
        const desde = (ip: string) => app.inject({ method: 'GET', url: '/v1/me', headers: { 'x-forwarded-for': ip } });

        const primera = [(await desde('1.1.1.1')).statusCode, (await desde('1.1.1.1')).statusCode, (await desde('1.1.1.1')).statusCode];
        const otra = (await desde('2.2.2.2')).statusCode;

        expect(primera).toEqual([401, 401, 429]);
        expect(otra).toBe(401);
      });
    });
  });

  describe('autenticación (corre en preValidation, ver shared/auth.ts)', () => {
    it('con un token que Supabase acepta, la petición llega al handler con su identidad', async () => {
      vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({ data: { user: { id: `test-auth-${randomUUID()}` } }, error: null } as never);

      const respuesta = await nuevaApp().inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer token-valido' } });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json()).toEqual({ usuarioId: expect.any(String), tenantId: expect.any(String) });
    });

    it('también con un cuerpo JSON: se lee antes de autenticar y el handler lo recibe completo', async () => {
      vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({ data: { user: { id: `test-auth-${randomUUID()}` } }, error: null } as never);

      const respuesta = await nuevaApp().inject({
        method: 'POST',
        url: '/v1/cuenta/eliminar',
        headers: { authorization: 'Bearer token-valido', 'content-type': 'application/json' },
        payload: JSON.stringify({ confirmacion: 'palabra incorrecta' }),
      });

      // Llegó al handler con su cuerpo (la validación de dominio lo rechaza): no es un 401 ni un 400 de parseo.
      expect(respuesta.statusCode).toBe(400);
      expect(respuesta.json()).toMatchObject({ codigo: 'VALIDACION' });
    });

    it('con un token que Supabase rechaza, 401 TOKEN_INVALIDO', async () => {
      vi.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } } as never);

      const respuesta = await nuevaApp().inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer token-vencido' } });

      expect(respuesta.statusCode).toBe(401);
      expect(respuesta.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    });

    it('sin token, 401 sin llamar nunca a Supabase', async () => {
      const espia = vi.spyOn(supabaseAdmin.auth, 'getUser');

      const respuesta = await nuevaApp().inject({ method: 'GET', url: '/v1/me' });

      expect(respuesta.statusCode).toBe(401);
      expect(respuesta.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
      expect(espia).not.toHaveBeenCalled();
    });

    it('un preflight CORS se responde sin autenticar (el navegador no manda token en el OPTIONS)', async () => {
      const respuesta = await nuevaApp().inject({
        method: 'OPTIONS',
        url: '/v1/me',
        headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
      });

      expect(respuesta.statusCode).toBe(204);
    });
  });

  describe('cabeceras de seguridad', () => {
    it('manda nosniff y permite que el frontend (otro origen) lea las respuestas', async () => {
      const respuesta = await nuevaApp().inject({ method: 'GET', url: '/salud' });

      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });

  describe('/salud/listo', () => {
    it('responde ok cuando la base de datos contesta', async () => {
      const respuesta = await nuevaApp().inject({ method: 'GET', url: '/salud/listo' });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json()).toEqual({ estado: 'ok' });
    });
  });
});
