import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut } } }));

/** `cerrando` es estado del módulo: cada prueba lo carga limpio. */
async function cargar() {
  vi.resetModules();
  return import('@/lib/sesion-expirada');
}

beforeEach(() => {
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  sessionStorage.clear();
});

describe('esErrorDeSesion', () => {
  it('un 401 por token vencido o por falta de token cierra la sesión', async () => {
    const { esErrorDeSesion } = await cargar();

    expect(esErrorDeSesion(401, 'TOKEN_INVALIDO')).toBe(true);
    expect(esErrorDeSesion(401, 'NO_AUTENTICADO')).toBe(true);
  });

  it('que Supabase Auth no responda (503) NO es una sesión inválida: no se cierra', async () => {
    const { esErrorDeSesion } = await cargar();

    expect(esErrorDeSesion(503, 'AUTENTICACION_NO_DISPONIBLE')).toBe(false);
  });

  it('ni los demás errores de la API (400, 403, 404, 409, 429, 500)', async () => {
    const { esErrorDeSesion } = await cargar();

    for (const status of [400, 403, 404, 409, 429, 500]) {
      expect(esErrorDeSesion(status, 'VALIDACION')).toBe(false);
    }
    expect(esErrorDeSesion(401, undefined)).toBe(false);
    expect(esErrorDeSesion(401, 'OTRO_CODIGO')).toBe(false);
  });
});

describe('cerrarSesionExpirada', () => {
  it('cierra la sesión solo en este navegador y manda a /login', async () => {
    const { cerrarSesionExpirada } = await cargar();
    const irA = vi.fn();

    cerrarSesionExpirada(irA);
    await vi.waitFor(() => expect(irA).toHaveBeenCalledWith('/login'));

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('si varias peticiones fallan a la vez, se cierra una sola vez', async () => {
    const { cerrarSesionExpirada } = await cargar();
    const irA = vi.fn();

    cerrarSesionExpirada(irA);
    cerrarSesionExpirada(irA);
    cerrarSesionExpirada(irA);
    await vi.waitFor(() => expect(irA).toHaveBeenCalled());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(irA).toHaveBeenCalledTimes(1);
  });

  it('aunque el cierre de sesión falle, igual manda a /login', async () => {
    signOut.mockRejectedValue(new Error('sin red'));
    const { cerrarSesionExpirada } = await cargar();
    const irA = vi.fn();

    cerrarSesionExpirada(irA);

    await vi.waitFor(() => expect(irA).toHaveBeenCalledWith('/login'));
  });

  it('deja el aviso para que /login explique por qué, hasta que se limpie', async () => {
    const { cerrarSesionExpirada, hayAvisoSesionExpirada, limpiarAvisoSesionExpirada } = await cargar();
    expect(hayAvisoSesionExpirada()).toBe(false);

    cerrarSesionExpirada(vi.fn());

    expect(hayAvisoSesionExpirada()).toBe(true);
    expect(hayAvisoSesionExpirada()).toBe(true); // leerlo no lo consume: /login se monta dos veces
    limpiarAvisoSesionExpirada();
    expect(hayAvisoSesionExpirada()).toBe(false);
  });
});
