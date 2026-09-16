import { describe, expect, it } from 'vitest';
import { calcularVencimientoMensualidad } from '../../src/modulos/tarjetas/calcular-ciclo.js';
import { repartirEnMensualidades } from '../../src/modulos/tarjetas/registrar-cargo.js';

describe('calcularVencimientoMensualidad', () => {
  it('una compra antes del corte cae en el corte de ese mismo mes', () => {
    // Corte día 15, compra el 5 de agosto -> corte 15 de agosto + 20 días.
    expect(calcularVencimientoMensualidad(new Date('2026-08-05T00:00:00Z'), 15, 20, 1)).toBe('2026-09-04');
  });

  it('una compra en el día exacto del corte cae en ESE corte, no en el siguiente', () => {
    expect(calcularVencimientoMensualidad(new Date('2026-08-15T00:00:00Z'), 15, 20, 1)).toBe('2026-09-04');
  });

  it('una compra después del corte se difiere al corte del mes siguiente', () => {
    // Compra el 16 de agosto, corte día 15 -> le toca el corte de septiembre.
    expect(calcularVencimientoMensualidad(new Date('2026-08-16T00:00:00Z'), 15, 20, 1)).toBe('2026-10-05');
  });

  it('cada mensualidad subsecuente cae un corte después de la anterior', () => {
    const fechaCompra = new Date('2026-08-05T00:00:00Z');
    expect(calcularVencimientoMensualidad(fechaCompra, 15, 20, 1)).toBe('2026-09-04');
    expect(calcularVencimientoMensualidad(fechaCompra, 15, 20, 2)).toBe('2026-10-05');
    expect(calcularVencimientoMensualidad(fechaCompra, 15, 20, 3)).toBe('2026-11-04');
  });

  it('un día de corte que no existe en el mes (31) se ajusta al último día real', () => {
    // Compra el 5 de enero, corte día 31 -> corte de enero (día 31, existe).
    expect(calcularVencimientoMensualidad(new Date('2026-01-05T00:00:00Z'), 31, 20, 1)).toBe('2026-02-20');
    // La mensualidad 2 le toca el corte de febrero, que no tiene día 31 -> se ajusta al 28 (2026 no es bisiesto).
    expect(calcularVencimientoMensualidad(new Date('2026-01-05T00:00:00Z'), 31, 20, 2)).toBe('2026-03-20');
  });

  it('el ciclo cruza de diciembre a enero del año siguiente', () => {
    expect(calcularVencimientoMensualidad(new Date('2026-12-20T00:00:00Z'), 15, 20, 1)).toBe('2027-02-04');
  });
});

describe('repartirEnMensualidades', () => {
  it('reparte un monto múltiplo exacto en partes iguales', () => {
    expect(repartirEnMensualidades(90000n, 3)).toEqual([30000n, 30000n, 30000n]);
  });

  it('carga el residuo del redondeo a la última mensualidad', () => {
    // 10000 centavos ($100.00) entre 3 = 3333.33... -> 3333, 3333, 3334.
    expect(repartirEnMensualidades(10000n, 3)).toEqual([3333n, 3333n, 3334n]);
  });

  it('la suma de las mensualidades siempre es exactamente el total, sin importar el residuo', () => {
    const total = 100001n;
    const mensualidades = repartirEnMensualidades(total, 7);
    const suma = mensualidades.reduce((acc, m) => acc + m, 0n);
    expect(suma).toBe(total);
  });

  it('un solo plazo devuelve el total completo', () => {
    expect(repartirEnMensualidades(15050n, 1)).toEqual([15050n]);
  });
});
