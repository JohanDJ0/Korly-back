import { describe, expect, it } from 'vitest';
import { esFechaIsoValida } from '../../src/shared/fechas.js';

describe('esFechaIsoValida', () => {
  it('acepta una fecha real', () => {
    expect(esFechaIsoValida('2026-08-15')).toBe(true);
  });

  it('acepta el 29 de febrero en año bisiesto', () => {
    expect(esFechaIsoValida('2028-02-29')).toBe(true);
  });

  it('rechaza el 29 de febrero en año no bisiesto', () => {
    expect(esFechaIsoValida('2026-02-29')).toBe(false);
  });

  it('rechaza un mes fuera de rango', () => {
    expect(esFechaIsoValida('2026-13-01')).toBe(false);
  });

  it('rechaza un día fuera de rango para ese mes', () => {
    expect(esFechaIsoValida('2026-04-31')).toBe(false);
  });

  it('rechaza un formato que no es YYYY-MM-DD', () => {
    expect(esFechaIsoValida('15/08/2026')).toBe(false);
  });

  it('rechaza una cadena vacía', () => {
    expect(esFechaIsoValida('')).toBe(false);
  });
});
