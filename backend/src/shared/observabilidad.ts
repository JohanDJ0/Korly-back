import * as Sentry from '@sentry/node';

/**
 * documento-maestro-v2.md, F0 "Fundaciones" y §15.1 (Must: "métricas
 * instrumentadas") — pendiente desde el inicio del proyecto. Sin
 * `SENTRY_DSN`, `Sentry.init` nunca se llama y cualquier
 * `Sentry.captureException` posterior es un no-op seguro (comportamiento
 * documentado del SDK, no un supuesto): nada se rompe en desarrollo ni
 * en CI, donde la variable nunca está definida.
 *
 * Se llama una sola vez, antes de crear la app (`server.ts`) — nunca
 * dentro de `crearApp()`, para que `test:local`/CI (que importan
 * `crearApp` directo, sin pasar por `server.ts`) no dependan de esto.
 */
export function inicializarObservabilidad(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Bajo a propósito: esto es para enterarse de errores reales, no
    // para tracing de performance con volumen — subir esto es una
    // decisión a tomar con datos de uso real, no un default a ciegas.
    tracesSampleRate: 0.1,
  });
}

/**
 * Único punto de llamada: el 500 genuino en `registrarManejadorErroresDominio`
 * (shared/http.ts) — nunca para un `ErrorDominio` (esos son respuestas
 * de negocio esperadas, no bugs) ni para los 4xx que ya reenvía Fastify.
 */
export function reportarErrorInesperado(error: unknown): void {
  Sentry.captureException(error);
}
