import { describe, expect, it } from 'vitest';
import { acotarFecha, calcularBloquesSemana, diasTranscurridosDelBloque, indiceBloque } from '../../src/modulos/desglose/semanas.js';

describe('calcularBloquesSemana', () => {
  it('una quincena de 15 días da dos bloques, 7 y 8: el día suelto se suma al segundo, no es una "semana 3"', () => {
    const bloques = calcularBloquesSemana('2026-10-01', '2026-10-15');
    expect(bloques.map((b) => b.dias)).toEqual([7, 8]);
    expect(bloques[0]).toMatchObject({ numero: 1, fechaInicio: '2026-10-01', fechaFin: '2026-10-07' });
    expect(bloques[1]).toMatchObject({ numero: 2, fechaInicio: '2026-10-08', fechaFin: '2026-10-15' });
  });

  it('el caso reportado: 16-30 de septiembre no deja el 30 como bloque de un día', () => {
    const bloques = calcularBloquesSemana('2026-09-16', '2026-09-30');
    expect(bloques.map((b) => [b.fechaInicio, b.fechaFin])).toEqual([
      ['2026-09-16', '2026-09-22'],
      ['2026-09-23', '2026-09-30'],
    ]);
  });

  it('una quincena de 16 días da 7 y 9', () => {
    const bloques = calcularBloquesSemana('2026-10-16', '2026-10-31');
    expect(bloques.map((b) => b.dias)).toEqual([7, 9]);
    expect(bloques[1]).toMatchObject({ fechaInicio: '2026-10-23', fechaFin: '2026-10-31' });
  });

  it('la segunda quincena de febrero (13 días) da 7 y 6', () => {
    expect(calcularBloquesSemana('2026-02-16', '2026-02-28').map((b) => b.dias)).toEqual([7, 6]);
  });

  it('toda quincena posible (13 a 16 días) da exactamente dos bloques que cubren el periodo completo', () => {
    for (const fin of ['2026-02-28', '2028-02-29', '2026-04-30', '2026-10-31']) {
      const bloques = calcularBloquesSemana(`${fin.slice(0, 8)}16`, fin);
      expect(bloques).toHaveLength(2);
      expect(bloques.reduce((suma, b) => suma + b.dias, 0)).toBe(Number(fin.slice(8)) - 15);
    }
  });
});

describe('indiceBloque', () => {
  it('ubica el día en su bloque; los días sueltos del final caen en el último', () => {
    expect(indiceBloque('2026-10-01', '2026-10-01', 2)).toBe(0);
    expect(indiceBloque('2026-10-01', '2026-10-07', 2)).toBe(0);
    expect(indiceBloque('2026-10-01', '2026-10-08', 2)).toBe(1);
    expect(indiceBloque('2026-10-01', '2026-10-15', 2)).toBe(1);
  });
});

describe('acotarFecha', () => {
  it('deja intacta una fecha dentro del rango y acota las de fuera', () => {
    expect(acotarFecha('2026-10-05', '2026-10-01', '2026-10-15')).toBe('2026-10-05');
    expect(acotarFecha('2026-09-28', '2026-10-01', '2026-10-15')).toBe('2026-10-01');
    expect(acotarFecha('2026-10-20', '2026-10-01', '2026-10-15')).toBe('2026-10-15');
  });
});

describe('diasTranscurridosDelBloque', () => {
  const [semana1, semana2] = calcularBloquesSemana('2026-10-01', '2026-10-15') as [ReturnType<typeof calcularBloquesSemana>[number], ReturnType<typeof calcularBloquesSemana>[number]];

  it('antes de que el bloque empiece, ningún día', () => {
    expect(diasTranscurridosDelBloque(semana2, '2026-10-07')).toBe(0);
  });

  it('a mitad del bloque, cuenta el día de hoy', () => {
    expect(diasTranscurridosDelBloque(semana1, '2026-10-01')).toBe(1);
    expect(diasTranscurridosDelBloque(semana2, '2026-10-11')).toBe(4);
  });

  it('el último día del bloque y después, todos', () => {
    expect(diasTranscurridosDelBloque(semana1, '2026-10-07')).toBe(7);
    expect(diasTranscurridosDelBloque(semana1, '2026-10-20')).toBe(7);
    expect(diasTranscurridosDelBloque(semana2, '2026-10-15')).toBe(8);
  });
});
