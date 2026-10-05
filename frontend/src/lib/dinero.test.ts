import { describe, expect, it } from 'vitest';

import { formatearMonto } from '@/lib/dinero';

describe('formatearMonto (centavos → texto en pesos mexicanos)', () => {
  it('convierte centavos a pesos con separador de miles y dos decimales', () => {
    expect(formatearMonto({ valorMinimo: 570000, moneda: 'MXN' })).toBe('$5,700.00');
    expect(formatearMonto({ valorMinimo: 102774, moneda: 'MXN' })).toBe('$1,027.74');
  });

  it('un monto de menos de un peso conserva los centavos', () => {
    expect(formatearMonto({ valorMinimo: 5, moneda: 'MXN' })).toBe('$0.05');
  });

  it('el cero se muestra como $0.00', () => {
    expect(formatearMonto({ valorMinimo: 0, moneda: 'MXN' })).toBe('$0.00');
  });

  it('un monto negativo (quincena sobregirada) lleva el signo menos', () => {
    expect(formatearMonto({ valorMinimo: -30000, moneda: 'MXN' })).toMatch(/-\$300\.00$/);
  });
});
