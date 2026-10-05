import { describe, expect, it } from 'vitest';
import { montoDesdeDto } from '../../src/shared/http.js';

describe('montoDesdeDto', () => {
  it('convierte un monto entero a bigint', () => {
    expect(montoDesdeDto({ valorMinimo: 12345, moneda: 'MXN' })).toEqual({ valorMinimo: 12345n, moneda: 'MXN' });
  });

  it('trunca los decimales en vez de redondear', () => {
    expect(montoDesdeDto({ valorMinimo: 99.9, moneda: 'MXN' }).valorMinimo).toBe(99n);
  });

  it.each([
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
    ['infinito negativo', Number.NEGATIVE_INFINITY],
    ['más allá del entero seguro', Number.MAX_SAFE_INTEGER + 2],
    ['un exponente absurdo', 1e300],
  ])('rechaza %s con un error de validación, no con un 500', (_nombre, valorMinimo) => {
    expect(() => montoDesdeDto({ valorMinimo, moneda: 'MXN' })).toThrow(expect.objectContaining({ codigo: 'VALIDACION' }));
  });

  it('rechaza un valor que no es número (por ejemplo un string en el JSON)', () => {
    expect(() => montoDesdeDto({ valorMinimo: '100' as unknown as number, moneda: 'MXN' })).toThrow(expect.objectContaining({ codigo: 'VALIDACION' }));
  });
});
