import { describe, expect, it } from 'vitest';
import { validarEntorno } from '../../src/shared/entorno.js';

describe('validarEntorno (arranque en producción)', () => {
  const valido: Record<string, string> = {
    DATABASE_URL: 'postgresql://postgres.abc:clave-admin@aws-0.pooler.supabase.com:5432/postgres',
    APP_DATABASE_URL: 'postgresql://app_backend.abc:clave-app@aws-0.pooler.supabase.com:6543/postgres',
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
    CORS_ORIGIN: 'https://app.korly.com.mx',
    FRONTEND_URL: 'https://app.korly.com.mx',
    STRIPE_SECRET_KEY: 'sk_live_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PRICE_MENSUAL: 'price_m',
    STRIPE_PRICE_ANUAL: 'price_a',
    RESEND_API_KEY: 're_x',
    SENTRY_DSN: 'https://x@sentry.io/1',
    TRUST_PROXY: 'true',
  };

  function con(cambios: Record<string, string | undefined>) {
    return validarEntorno({ ...valido, ...cambios });
  }

  it('una configuración completa no da errores ni avisos', () => {
    expect(validarEntorno(valido)).toEqual({ errores: [], avisos: [] });
  });

  it('reporta TODAS las variables obligatorias que faltan, no solo la primera', () => {
    const { errores } = validarEntorno({});
    for (const nombre of ['DATABASE_URL', 'APP_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CORS_ORIGIN', 'FRONTEND_URL']) {
      expect(errores.some((e) => e.includes(nombre)), nombre).toBe(true);
    }
  });

  describe('el servidor nunca debe correr con un rol que se salta RLS (ADR-005)', () => {
    it('rechaza APP_DATABASE_URL con el rol de administración', () => {
      const { errores } = con({ APP_DATABASE_URL: 'postgresql://postgres.abc:x@aws-0.pooler.supabase.com:6543/postgres' });
      expect(errores.some((e) => e.includes('app_backend'))).toBe(true);
    });

    it('rechaza APP_DATABASE_URL igual a DATABASE_URL', () => {
      const { errores } = con({ APP_DATABASE_URL: valido['DATABASE_URL'] });
      expect(errores.some((e) => e.includes('son iguales'))).toBe(true);
    });

    it('acepta el usuario de Supabase (app_backend.<ref>) y el de CI (app_backend)', () => {
      expect(con({}).errores).toEqual([]);
      expect(con({ APP_DATABASE_URL: 'postgresql://app_backend:clave@localhost:5432/postgres', CORS_ORIGIN: 'https://x.com', FRONTEND_URL: 'https://x.com' }).errores).toEqual([]);
    });

    it('una URL ilegible es un error, no un crash', () => {
      expect(con({ APP_DATABASE_URL: 'esto no es una url' }).errores.some((e) => e.includes('no es una URL válida'))).toBe(true);
    });
  });

  describe('valores de desarrollo que fallan en silencio en producción', () => {
    it('CORS_ORIGIN y FRONTEND_URL no pueden faltar ni apuntar a localhost', () => {
      expect(con({ CORS_ORIGIN: undefined }).errores.some((e) => e.includes('CORS_ORIGIN'))).toBe(true);
      expect(con({ CORS_ORIGIN: 'http://localhost:5173' }).errores.some((e) => e.includes('CORS_ORIGIN'))).toBe(true);
      expect(con({ FRONTEND_URL: 'http://127.0.0.1:5173' }).errores.some((e) => e.includes('FRONTEND_URL'))).toBe(true);
    });
  });

  describe('Stripe: todo o nada', () => {
    it('una integración a medias es un error (aceptaría cobros pero nunca activaría el plan)', () => {
      const { errores } = con({ STRIPE_WEBHOOK_SECRET: undefined });
      expect(errores.some((e) => e.includes('Stripe a medias') && e.includes('STRIPE_WEBHOOK_SECRET'))).toBe(true);
    });

    it('sin Stripe del todo no es un error, solo un aviso', () => {
      const resultado = con({ STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined, STRIPE_PRICE_MENSUAL: undefined, STRIPE_PRICE_ANUAL: undefined });
      expect(resultado.errores).toEqual([]);
      expect(resultado.avisos.some((a) => a.includes('Stripe no está configurado'))).toBe(true);
    });

    it('avisa si producción usa una clave de modo prueba', () => {
      expect(con({ STRIPE_SECRET_KEY: 'sk_test_x' }).avisos.some((a) => a.includes('modo prueba'))).toBe(true);
    });
  });

  it('avisa (sin impedir arrancar) cuando faltan Resend, Sentry o TRUST_PROXY', () => {
    const { errores, avisos } = con({ RESEND_API_KEY: undefined, SENTRY_DSN: undefined, TRUST_PROXY: undefined });

    expect(errores).toEqual([]);
    expect(avisos.some((a) => a.includes('RESEND_API_KEY'))).toBe(true);
    expect(avisos.some((a) => a.includes('SENTRY_DSN'))).toBe(true);
    expect(avisos.some((a) => a.includes('TRUST_PROXY'))).toBe(true);
  });
});
