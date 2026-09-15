import { describe, expect, it } from 'vitest';
import { esUuidValido } from '../../src/shared/validacion.js';

describe('esUuidValido', () => {
  it('acepta un UUID v4 real', () => {
    expect(esUuidValido('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('acepta mayúsculas', () => {
    expect(esUuidValido('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rechaza una cadena arbitraria', () => {
    expect(esUuidValido('no-es-un-uuid')).toBe(false);
  });

  it('rechaza una cadena vacía', () => {
    expect(esUuidValido('')).toBe(false);
  });

  it('rechaza un UUID con un carácter de más', () => {
    expect(esUuidValido('550e8400-e29b-41d4-a716-4466554400000')).toBe(false);
  });

  it('rechaza algo que intente inyectar SQL', () => {
    expect(esUuidValido("'; DROP TABLE gastos; --")).toBe(false);
  });
});
