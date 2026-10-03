import { describe, expect, it } from 'vitest';
import { inicializarObservabilidad, limpiarEventoSentry, reportarErrorInesperado } from '../../src/shared/observabilidad.js';

describe('observabilidad', () => {
  it('inicializarObservabilidad no lanza sin SENTRY_DSN (comportamiento esperado en desarrollo y CI)', () => {
    delete process.env.SENTRY_DSN;
    expect(() => inicializarObservabilidad()).not.toThrow();
  });

  it('reportarErrorInesperado no lanza sin Sentry inicializado (no-op documentado del SDK)', () => {
    expect(() => reportarErrorInesperado(new Error('prueba'))).not.toThrow();
  });

  describe('limpiarEventoSentry', () => {
    const consultaFallida = 'Failed query: insert into "gastos" ("nota", "monto") values ($1, $2)\nparams: tacos con Laura,123450';

    it('quita los valores de una consulta fallida pero conserva el SQL', () => {
      const evento = limpiarEventoSentry({ exception: { values: [{ type: 'DrizzleQueryError', value: consultaFallida }] } });

      const mensaje = evento.exception?.values?.[0]?.value ?? '';
      expect(mensaje).toContain('insert into "gastos"');
      expect(mensaje).toContain('params: [omitidos]');
      expect(mensaje).not.toContain('tacos con Laura');
      expect(mensaje).not.toContain('123450');
    });

    it('también limpia el mensaje del evento y todas las excepciones encadenadas', () => {
      const evento = limpiarEventoSentry({
        message: consultaFallida,
        exception: {
          values: [
            { value: 'PostgresError: duplicate key' },
            { value: consultaFallida },
          ],
        },
      });

      expect(evento.message).not.toContain('Laura');
      expect(evento.exception?.values?.[0]?.value).toBe('PostgresError: duplicate key');
      expect(evento.exception?.values?.[1]?.value).not.toContain('Laura');
    });

    it('deja intacto un evento sin parámetros, o sin mensaje ni excepciones', () => {
      expect(limpiarEventoSentry({ message: 'Ocurrió un error inesperado' }).message).toBe('Ocurrió un error inesperado');
      expect(limpiarEventoSentry({})).toEqual({});
    });
  });
});
