import { describe, expect, it } from 'vitest';
import { calcularQuincenaDeCalendario } from '../../src/modulos/periodos/calcular-quincena.js';

/**
 * Casos frontera que ADR-004 pide explícitamente: meses de 31 días,
 * meses de 30, febrero no bisiesto, febrero bisiesto. Sin base de
 * datos — es una función pura, se prueba como tal.
 */
describe('calcularQuincenaDeCalendario', () => {
  it('día 1 de un mes de 31 días -> primera quincena', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-08-01T00:00:00Z'))).toEqual({
      fechaInicio: '2026-08-01',
      fechaFin: '2026-08-15',
    });
  });

  it('día 15 -> sigue siendo la primera quincena (límite inclusivo)', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-08-15T00:00:00Z'))).toEqual({
      fechaInicio: '2026-08-01',
      fechaFin: '2026-08-15',
    });
  });

  it('día 16 de un mes de 31 días -> segunda quincena termina en 31', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-08-16T00:00:00Z'))).toEqual({
      fechaInicio: '2026-08-16',
      fechaFin: '2026-08-31',
    });
  });

  it('mes de 30 días -> segunda quincena termina en 30', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-04-20T00:00:00Z'))).toEqual({
      fechaInicio: '2026-04-16',
      fechaFin: '2026-04-30',
    });
  });

  it('febrero no bisiesto (2026) -> segunda quincena termina en 28', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-02-20T00:00:00Z'))).toEqual({
      fechaInicio: '2026-02-16',
      fechaFin: '2026-02-28',
    });
  });

  it('febrero bisiesto (2028) -> segunda quincena termina en 29', () => {
    expect(calcularQuincenaDeCalendario(new Date('2028-02-20T00:00:00Z'))).toEqual({
      fechaInicio: '2028-02-16',
      fechaFin: '2028-02-29',
    });
  });

  it('último día del año -> no se desborda a enero', () => {
    expect(calcularQuincenaDeCalendario(new Date('2026-12-31T00:00:00Z'))).toEqual({
      fechaInicio: '2026-12-16',
      fechaFin: '2026-12-31',
    });
  });
});
