import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatearFechaActividad, formatearRangoFechas, hoyISO, quincenaDeHoy } from '@/lib/fechas';

afterEach(() => {
  vi.useRealTimers();
});

/** Fecha LOCAL del navegador (como el usuario la vive), no UTC: por eso se arma con `new Date(año, mes, día, hora)`. */
function hoyEs(anio: number, mes: number, dia: number, hora = 12) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(anio, mes - 1, dia, hora));
}

describe('quincenaDeHoy (misma regla que el backend: 1–15 o 16–fin de mes)', () => {
  it('del 1 al 15 es la primera quincena', () => {
    hoyEs(2026, 10, 1);
    expect(quincenaDeHoy()).toEqual({ fechaInicio: '2026-10-01', fechaFin: '2026-10-15' });
    hoyEs(2026, 10, 15);
    expect(quincenaDeHoy()).toEqual({ fechaInicio: '2026-10-01', fechaFin: '2026-10-15' });
  });

  it('del 16 en adelante es la segunda, hasta el último día real del mes', () => {
    hoyEs(2026, 10, 16);
    expect(quincenaDeHoy()).toEqual({ fechaInicio: '2026-10-16', fechaFin: '2026-10-31' });
    hoyEs(2026, 9, 20);
    expect(quincenaDeHoy()).toEqual({ fechaInicio: '2026-09-16', fechaFin: '2026-09-30' });
  });

  it('febrero termina el 28, y en año bisiesto el 29', () => {
    hoyEs(2026, 2, 20);
    expect(quincenaDeHoy().fechaFin).toBe('2026-02-28');
    hoyEs(2028, 2, 20);
    expect(quincenaDeHoy().fechaFin).toBe('2028-02-29');
  });

  it('cerca de la medianoche cuenta el día local, no el UTC (en México son las 6 pm de ayer en UTC)', () => {
    hoyEs(2026, 10, 16, 23);
    expect(quincenaDeHoy().fechaInicio).toBe('2026-10-16');
    hoyEs(2026, 10, 15, 0);
    expect(quincenaDeHoy().fechaInicio).toBe('2026-10-01');
  });
});

describe('hoyISO', () => {
  it('da la fecha local con ceros a la izquierda', () => {
    hoyEs(2026, 3, 5);
    expect(hoyISO()).toBe('2026-03-05');
  });
});

describe('formatearRangoFechas', () => {
  it('no corre las fechas un día hacia atrás por la zona horaria', () => {
    expect(formatearRangoFechas('2026-09-01', '2026-09-15')).toMatch(/^1 de septiembre – 15 de septiembre$/);
  });
});

describe('formatearFechaActividad', () => {
  it('dice "Hoy" para la fecha de hoy y el día corto para las demás', () => {
    hoyEs(2026, 10, 4);
    expect(formatearFechaActividad('2026-10-04')).toBe('Hoy');
    expect(formatearFechaActividad('2026-09-16')).toMatch(/^16 sep/);
  });
});
