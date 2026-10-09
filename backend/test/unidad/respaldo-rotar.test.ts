import { describe, expect, it } from 'vitest';
import { DIAS_DE_RETENCION, fechaDeNombre, nombreDeRespaldo, respaldosVencidos } from '../../src/modulos/respaldos/rotar.js';

describe('nombres de respaldo', () => {
  it('el nombre lleva la fecha UTC y se puede leer de vuelta', () => {
    const nombre = nombreDeRespaldo(new Date('2026-10-08T20:15:30.987Z'));

    expect(nombre).toBe('korly-20261008T201530Z.korlybak');
    expect(fechaDeNombre(nombre)?.toISOString()).toBe('2026-10-08T20:15:30.000Z');
  });

  it('un archivo que no es un respaldo de Korly no tiene fecha', () => {
    for (const nombre of ['notas.txt', 'korly-20261008.korlybak', 'korly-20261308T000000Z.korlybak', 'korly-20260230T000000Z.korlybak']) {
      expect(fechaDeNombre(nombre)).toBeNull();
    }
  });
});

describe('rotación a 30 días (lo que promete el aviso de privacidad)', () => {
  const ahora = new Date('2026-11-10T12:00:00Z');

  it('la retención es de 30 días', () => {
    expect(DIAS_DE_RETENCION).toBe(30);
  });

  it('borra solo los que tienen más de 30 días', () => {
    const nombres = [
      'korly-20261010T120000Z.korlybak', // exactamente 31 días → vence
      'korly-20261011T120000Z.korlybak', // exactamente 30 días → todavía no
      'korly-20261011T115959Z.korlybak', // 30 días y un segundo → vence
      'korly-20261109T120000Z.korlybak', // ayer
      'korly-20260101T000000Z.korlybak', // muy viejo
    ];

    expect(respaldosVencidos(nombres, ahora)).toEqual(['korly-20261010T120000Z.korlybak', 'korly-20261011T115959Z.korlybak', 'korly-20260101T000000Z.korlybak']);
  });

  it('nunca toca archivos ajenos a los respaldos', () => {
    const nombres = ['fotos-de-2020.zip', 'korly-20200101.korlybak', 'korly-viejo.korlybak', 'LEEME.txt'];

    expect(respaldosVencidos(nombres, ahora)).toEqual([]);
  });
});
