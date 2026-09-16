import { describe, expect, it } from 'vitest';
import { inicializarObservabilidad, reportarErrorInesperado } from '../../src/shared/observabilidad.js';

describe('observabilidad', () => {
  it('inicializarObservabilidad no lanza sin SENTRY_DSN (comportamiento esperado en desarrollo y CI)', () => {
    delete process.env.SENTRY_DSN;
    expect(() => inicializarObservabilidad()).not.toThrow();
  });

  it('reportarErrorInesperado no lanza sin Sentry inicializado (no-op documentado del SDK)', () => {
    expect(() => reportarErrorInesperado(new Error('prueba'))).not.toThrow();
  });
});
