import * as Sentry from '@sentry/react';

/**
 * Mismo criterio que el backend (backend/src/shared/observabilidad.ts,
 * documento-maestro-v2.md F0/§15.1): sin `VITE_SENTRY_DSN`, `Sentry.init`
 * nunca se llama y el `<Sentry.ErrorBoundary>` de App.tsx sigue
 * funcionando igual (captura y muestra el fallback), solo que no manda
 * nada a ningún lado — comportamiento seguro documentado del SDK, no
 * un supuesto propio.
 */
export function inicializarObservabilidad(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Bajo a propósito, mismo motivo que el backend: enterarse de
    // errores reales, no tracing de performance con volumen por default.
    tracesSampleRate: 0.1,
  });
}
