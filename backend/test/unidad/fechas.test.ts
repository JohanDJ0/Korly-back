import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ahoraEnMexico, diaCalendarioEnMexico, esFechaIsoValida, fechaISO } from '../../src/shared/fechas.js';

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

describe('ahoraEnMexico', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hallazgo real: a las 9pm hora de México, fechaISO(new Date()) ya da mañana, pero fechaISO(ahoraEnMexico()) da hoy', () => {
    // 2026-09-18T03:00:00Z = 2026-09-17T21:00:00-06:00 (9pm en México,
    // el caso exacto reportado por el usuario contra su cuenta real).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T03:00:00Z'));

    expect(fechaISO(new Date())).toBe('2026-09-18');
    expect(fechaISO(ahoraEnMexico())).toBe('2026-09-17');
  });

  it('a media mañana en México (mismo día en UTC y en México), ambos coinciden', () => {
    // 2026-09-17T16:00:00Z = 2026-09-17T10:00:00-06:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T16:00:00Z'));

    expect(fechaISO(new Date())).toBe('2026-09-17');
    expect(fechaISO(ahoraEnMexico())).toBe('2026-09-17');
  });

  it('el Date que devuelve no es un instante real: su valor difiere del reloj real en exactamente 6 horas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T16:00:00Z'));

    const diferenciaMs = new Date().getTime() - ahoraEnMexico().getTime();
    expect(diferenciaMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe('diaCalendarioEnMexico', () => {
  it('un instante de la noche en México, que en UTC ya es el día siguiente, cuenta como del día de México', () => {
    // 9pm del 5 de octubre en México = 03:00 UTC del 6.
    expect(diaCalendarioEnMexico(new Date('2026-10-06T03:00:00Z'))).toBe('2026-10-05');
  });

  it('el límite exacto: 06:00 UTC es la medianoche de México', () => {
    expect(diaCalendarioEnMexico(new Date('2026-10-06T05:59:59Z'))).toBe('2026-10-05');
    expect(diaCalendarioEnMexico(new Date('2026-10-06T06:00:00Z'))).toBe('2026-10-06');
  });

  it('cruza el fin de año sin tropezar', () => {
    expect(diaCalendarioEnMexico(new Date('2027-01-01T04:00:00Z'))).toBe('2026-12-31');
  });
});
