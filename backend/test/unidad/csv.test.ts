import { describe, expect, it } from 'vitest';
import { centavosADecimalCsv, escaparCsv, filaCsv, parsearFilasCsv, parsearMontoDecimalCsv } from '../../src/shared/csv.js';

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

describe('parsearFilasCsv', () => {
  it('parsea filas simples separadas por coma', () => {
    expect(parsearFilasCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('respeta un campo entrecomillado con una coma adentro', () => {
    expect(parsearFilasCsv('fecha,nota\n2026-08-01,"Cena, con amigos"')).toEqual([
      ['fecha', 'nota'],
      ['2026-08-01', 'Cena, con amigos'],
    ]);
  });

  it('interpreta comillas dobles como una comilla literal', () => {
    expect(parsearFilasCsv('nota\n"Dijo ""hola"""')).toEqual([['nota'], ['Dijo "hola"']]);
  });

  it('respeta un salto de línea real dentro de un campo entrecomillado', () => {
    expect(parsearFilasCsv('nota\n"línea 1\nlínea 2"')).toEqual([['nota'], ['línea 1\nlínea 2']]);
  });

  it('acepta CRLF como separador de fila', () => {
    expect(parsearFilasCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('quita un BOM inicial', () => {
    expect(parsearFilasCsv('﻿fecha,monto\n2026-08-01,100')).toEqual([
      ['fecha', 'monto'],
      ['2026-08-01', '100'],
    ]);
  });

  it('ignora líneas en blanco sueltas', () => {
    expect(parsearFilasCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('sin salto de línea final, no descarta la última fila', () => {
    expect(parsearFilasCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parsearMontoDecimalCsv', () => {
  it('acepta un entero', () => {
    expect(parsearMontoDecimalCsv('150')).toBe(15000n);
  });

  it('acepta dos decimales', () => {
    expect(parsearMontoDecimalCsv('150.50')).toBe(15050n);
  });

  it('rellena un solo decimal', () => {
    expect(parsearMontoDecimalCsv('150.5')).toBe(15050n);
  });

  it('rechaza un negativo', () => {
    expect(parsearMontoDecimalCsv('-150')).toBeNull();
  });

  it('rechaza más de dos decimales', () => {
    expect(parsearMontoDecimalCsv('150.505')).toBeNull();
  });

  it('rechaza texto no numérico', () => {
    expect(parsearMontoDecimalCsv('abc')).toBeNull();
  });

  it('rechaza notación científica', () => {
    expect(parsearMontoDecimalCsv('1.5e3')).toBeNull();
  });

  it('ignora espacios alrededor', () => {
    expect(parsearMontoDecimalCsv('  150.50  ')).toBe(15050n);
  });
});
