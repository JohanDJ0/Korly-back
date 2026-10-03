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
const PARAMS_DE_CONSULTA = /\nparams:[^\n]*/g;

/**
 * Quita los **valores** de una consulta fallida antes de que el evento
 * salga hacia Sentry (un tercero, ver el aviso de privacidad). Un error de
 * Drizzle trae el SQL y, en la línea siguiente, sus parámetros en el
 * mensaje ("Failed query: ..." y luego "params: 123450,tacos con Laura"): montos,
 * notas, nombres de categorías y ids — datos financieros del usuario. El
 * SQL parametrizado se conserva, que es lo que sirve para depurar.
 */
export function limpiarEventoSentry<T extends Sentry.Event>(evento: T): T {
  if (evento.message) evento.message = evento.message.replace(PARAMS_DE_CONSULTA, '\nparams: [omitidos]');
  for (const excepcion of evento.exception?.values ?? []) {
    if (excepcion.value) excepcion.value = excepcion.value.replace(PARAMS_DE_CONSULTA, '\nparams: [omitidos]');
  }
  return evento;
}

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
    // Explícito aunque sea el default: no mandar IP, cookies ni cabeceras
    // de identidad — esta app maneja datos financieros personales.
    sendDefaultPii: false,
    beforeSend: (evento) => limpiarEventoSentry(evento),
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
