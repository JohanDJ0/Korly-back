import { describe, expect, it } from 'vitest';
import { centavosADecimalCsv, escaparCsv, filaCsv } from '../../src/shared/csv.js';

describe('escaparCsv', () => {
  it('deja tal cual un valor sin caracteres especiales', () => {
    expect(escaparCsv('Comida')).toBe('Comida');
  });

  it('envuelve en comillas un valor con coma', () => {
    expect(escaparCsv('Renta, luz y agua')).toBe('"Renta, luz y agua"');
  });

  it('escapa comillas internas duplicándolas', () => {
    expect(escaparCsv('Dijo "hola"')).toBe('"Dijo ""hola"""');
  });

  it('envuelve en comillas un valor con salto de línea', () => {
    expect(escaparCsv('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
  });
});

describe('filaCsv', () => {
  it('une los valores con coma y termina en CRLF', () => {
    expect(filaCsv(['a', 'b', 'c'])).toBe('a,b,c\r\n');
  });
});

describe('centavosADecimalCsv', () => {
  it('formatea un monto positivo exacto, sin pasar por número flotante', () => {
    expect(centavosADecimalCsv(199900n)).toBe('1999.00');
  });

  it('rellena los centavos a dos dígitos', () => {
    expect(centavosADecimalCsv(105n)).toBe('1.05');
  });

  it('formatea un monto negativo con el signo antes del número', () => {
    expect(centavosADecimalCsv(-500n)).toBe('-5.00');
  });

  it('formatea cero', () => {
    expect(centavosADecimalCsv(0n)).toBe('0.00');
  });
});
