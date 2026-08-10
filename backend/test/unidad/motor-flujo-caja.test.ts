import { describe, expect, it } from 'vitest';
import { calcularDiasRestantes, pisoDivisionBigInt } from '../../src/modulos/disponible/motor-flujo-caja.js';

describe('calcularDiasRestantes', () => {
  it('el primer día del periodo cuenta todos los días, incluido hoy', () => {
    // Quincena 2026-08-01 al 2026-08-15, hoy = día 1 -> 15 días quedan.
    expect(calcularDiasRestantes('2026-08-15', new Date('2026-08-01T00:00:00Z'))).toBe(15);
  });

  it('a mitad de periodo cuenta hoy + los días que faltan', () => {
    // hoy = 2026-08-09, fin = 2026-08-15 -> 6 días de diferencia + 1 = 7.
    expect(calcularDiasRestantes('2026-08-15', new Date('2026-08-09T00:00:00Z'))).toBe(7);
  });

  it('el último día del periodo da exactamente 1, no 0 (el +1 de la fórmula)', () => {
    expect(calcularDiasRestantes('2026-08-15', new Date('2026-08-15T00:00:00Z'))).toBe(1);
  });

  it('un periodo vencido sin cerrar (caso no cubierto por el modelo de dominio) no baja de 1', () => {
    expect(calcularDiasRestantes('2026-08-15', new Date('2026-08-20T00:00:00Z'))).toBe(1);
  });
});

describe('pisoDivisionBigInt', () => {
  it('división exacta positiva', () => {
    expect(pisoDivisionBigInt(3000n, 5n)).toBe(600n);
  });

  it('división inexacta positiva trunca hacia abajo, no redondea', () => {
    // 3000 / 7 = 428.571... -> piso 428, NUNCA 429 (favorece al usuario, ADR-002).
    expect(pisoDivisionBigInt(3000n, 7n)).toBe(428n);
  });

  it('división inexacta negativa (sobregiro) va hacia más negativo, no hacia cero', () => {
    // -5000 / 7 = -714.285... -> piso -715, no -714 (el operador nativo
    // de bigint trunca hacia cero y daría -714, subestimando el sobregiro).
    expect(pisoDivisionBigInt(-5000n, 7n)).toBe(-715n);
  });

  it('división exacta negativa no dispara la corrección de más de la cuenta', () => {
    expect(pisoDivisionBigInt(-14n, 7n)).toBe(-2n);
  });
});
