import { describe, expect, it } from 'vitest';

import { GUIA_DESDE, guiaActiva, pasoDeInicio, TEXTOS_GUIA, type ContextoGuia, type PasoGuia } from '@/lib/guia';

const nueva = '2026-10-12T15:00:00Z';
const vieja = '2026-10-01T15:00:00Z';

describe('guiaActiva', () => {
  it('las cuentas creadas desde el lanzamiento de la guía la ven', () => {
    expect(guiaActiva({ created_at: nueva, user_metadata: {} })).toBe(true);
    expect(guiaActiva({ created_at: GUIA_DESDE })).toBe(true);
  });

  it('las cuentas anteriores no: ya saben usar la app', () => {
    expect(guiaActiva({ created_at: vieja, user_metadata: {} })).toBe(false);
  });

  it('terminarla o saltarla (guia_terminada: true) la apaga aunque la cuenta sea nueva', () => {
    expect(guiaActiva({ created_at: nueva, user_metadata: { guia_terminada: true } })).toBe(false);
  });

  it('"Ver la guía otra vez" (guia_terminada: false) la enciende aunque la cuenta sea vieja', () => {
    expect(guiaActiva({ created_at: vieja, user_metadata: { guia_terminada: false } })).toBe(true);
  });

  it('sin sesión, o sin fecha de creación legible, no hay guía', () => {
    expect(guiaActiva(undefined)).toBe(false);
    expect(guiaActiva(null)).toBe(false);
    expect(guiaActiva({ user_metadata: {} })).toBe(false);
    expect(guiaActiva({ created_at: 'no es fecha' })).toBe(false);
  });
});

const sinNada: ContextoGuia = { sinPeriodo: false, sinIngreso: false, conCifra: false, hayAtajos: false, hayGastos: false };
const vistos = (...pasos: PasoGuia[]) => new Set<PasoGuia>(pasos);

describe('pasoDeInicio — el paso que toca según lo que la persona tiene en pantalla', () => {
  it('sin quincena: primero la bienvenida, luego la explicación de la quincena', () => {
    const ctx = { ...sinNada, sinPeriodo: true };

    expect(pasoDeInicio(vistos(), ctx)).toBe('bienvenida');
    expect(pasoDeInicio(vistos('bienvenida'), ctx)).toBe('quincena');
    expect(pasoDeInicio(vistos('bienvenida', 'quincena'), ctx)).toBeNull();
  });

  it('la explicación de la quincena no sale si no se vio la bienvenida (p. ej. cuenta vieja que reinicia la guía)', () => {
    expect(pasoDeInicio(vistos('quincena'), { ...sinNada, sinPeriodo: true })).toBe('bienvenida');
  });

  it('con quincena pero sin ingreso: el paso del ingreso', () => {
    expect(pasoDeInicio(vistos(), { ...sinNada, sinIngreso: true })).toBe('ingreso');
    expect(pasoDeInicio(vistos('ingreso'), { ...sinNada, sinIngreso: true })).toBeNull();
  });

  it('con la cifra: primero la cifra, luego "Registrar gasto" (nunca al revés)', () => {
    const ctx = { ...sinNada, conCifra: true };

    expect(pasoDeInicio(vistos(), ctx)).toBe('cifra');
    expect(pasoDeInicio(vistos('cifra'), ctx)).toBe('registrar-gasto');
    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto'), ctx)).toBeNull();
  });

  it('los atajos y los recurrentes esperan a que haya atajos / un primer gasto, y a que se haya leído "Registrar gasto"', () => {
    const base = vistos('cifra');

    expect(pasoDeInicio(base, { ...sinNada, conCifra: true, hayAtajos: true })).toBe('registrar-gasto');
    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto'), { ...sinNada, conCifra: true, hayAtajos: true })).toBe('atajo-inicio');
    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto'), { ...sinNada, conCifra: true, hayGastos: true })).toBe('recurrentes');
  });

  it('con atajos y gastos, los atajos van antes que los recurrentes', () => {
    const ctx = { ...sinNada, conCifra: true, hayAtajos: true, hayGastos: true };

    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto'), ctx)).toBe('atajo-inicio');
    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto', 'atajo-inicio'), ctx)).toBe('recurrentes');
  });

  it('el cierre llega solo después de los recurrentes, y luego no queda nada', () => {
    const ctx = { ...sinNada, conCifra: true, hayGastos: true };

    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto', 'recurrentes'), ctx)).toBe('cierre');
    expect(pasoDeInicio(vistos('cifra', 'registrar-gasto', 'recurrentes', 'cierre'), ctx)).toBeNull();
  });

  it('el paso del formulario de gasto nunca es de Inicio', () => {
    const todo = { ...sinNada, conCifra: true, hayAtajos: true, hayGastos: true };

    expect(pasoDeInicio(vistos('atajo-formulario'), todo)).not.toBe('atajo-formulario');
  });
});

describe('TEXTOS_GUIA', () => {
  it('tiene el texto de cada paso aprobado, sin tutear a medias ni dejar vacíos', () => {
    for (const [paso, texto] of Object.entries(TEXTOS_GUIA)) {
      expect(texto.texto.length, paso).toBeGreaterThan(20);
    }
    expect(TEXTOS_GUIA.recurrentes.titulo).toBe('¿Tienes gastos que se repiten?');
    expect(TEXTOS_GUIA.cierre.titulo).toBe('Listo, ya sabes lo principal');
  });
});
