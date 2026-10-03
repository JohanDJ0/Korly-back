import { describe, expect, it } from 'vitest';
import { calcularMetricas, formatearReporte, type DatosTenant } from '../../src/modulos/metricas/calcular-metricas.js';

describe('calcularMetricas', () => {
  // 10 de noviembre de 2026, mediodía en México.
  const AHORA = new Date('2026-11-10T18:00:00Z');

  function tenant(cambios: Partial<DatosTenant> & Pick<DatosTenant, 'altaEn'>): DatosTenant {
    return {
      plan: 'free',
      estadoSuscripcion: null,
      recibirRecordatorios: true,
      tienePeriodo: true,
      tieneIngreso: true,
      capturas: [],
      recordatoriosEnviadosUltimos7Dias: 0,
      ...cambios,
    };
  }

  // A: constante al inicio, activa en las semanas 1, 2 y 4 (no la 3). 6 días con captura en sus primeros 14.
  const A = tenant({
    altaEn: new Date('2026-10-01T15:00:00Z'),
    capturas: ['2026-10-01T20:00:00Z', '2026-10-02T18:00:00Z', '2026-10-03T18:00:00Z', '2026-10-04T18:00:00Z', '2026-10-05T18:00:00Z', '2026-10-09T18:00:00Z', '2026-10-16T18:00:00Z', '2026-10-30T18:00:00Z'].map(
      (instante) => new Date(instante)
    ),
    recordatoriosEnviadosUltimos7Dias: 3,
  });
  // B: se registró, configuró todo y nunca capturó nada.
  const B = tenant({ altaEn: new Date('2026-10-01T15:00:00Z') });
  // C: entró hace 27 h y capturó 5 h después del alta.
  const C = tenant({ altaEn: new Date('2026-11-09T15:00:00Z'), capturas: [new Date('2026-11-09T20:00:00Z')], recordatoriosEnviadosUltimos7Dias: 2 });
  // D: entró hace 3 h, sin ingreso todavía, ya capturó. Canceló su suscripción.
  const D = tenant({ altaEn: new Date('2026-11-10T15:00:00Z'), tieneIngreso: false, capturas: [new Date('2026-11-10T16:00:00Z')], estadoSuscripcion: 'cancelada' });
  // E: en prueba de Pro, no creó ni su periodo, sin recordatorios.
  const E = tenant({ altaEn: new Date('2026-10-20T15:00:00Z'), plan: 'pro', estadoSuscripcion: 'trialing', tienePeriodo: false, tieneIngreso: false, recibirRecordatorios: false });

  const m = calcularMetricas([A, B, C, D, E], AHORA);

  it('embudo: cada paso se mide contra todos los registrados', () => {
    expect(m.embudo.registrados).toBe(5);
    expect(m.embudo.conPeriodo).toEqual({ n: 4, de: 5, porcentaje: 80 });
    expect(m.embudo.conIngreso).toEqual({ n: 3, de: 5, porcentaje: 60 });
    expect(m.embudo.conPrimerGasto).toEqual({ n: 3, de: 5, porcentaje: 60 });
  });

  it('"gasto en 24 h" solo mide a quien ya tuvo 24 h: D (3 h de vida) queda fuera de la base', () => {
    // Elegibles: A, B, C (27 h) y E. Lo lograron A y C.
    expect(m.embudo.conGastoEn24Horas).toEqual({ n: 2, de: 4, porcentaje: 50 });
  });

  it('tiempo al primer gasto: mediana de quien ya capturó', () => {
    // A 5 h, C 5 h, D 1 h -> mediana 5.
    expect(m.tiempoAlPrimerGasto).toEqual({ usuarios: 3, medianaHoras: 5 });
  });

  it('constancia: solo cuenta a quien ya completó sus 14 días (A, B y E)', () => {
    // Días con captura en sus primeros 14: A 6, B 0, E 0.
    expect(m.constanciaPrimerasDosSemanas.elegibles).toBe(3);
    expect(m.constanciaPrimerasDosSemanas.medianaDiasActivos).toBe(0);
    expect(m.constanciaPrimerasDosSemanas.conCincoOMasDias).toEqual({ n: 1, de: 3, porcentaje: 33.3 });
  });

  it('retención semanal: cada semana solo cuenta a quien ya la completó entera', () => {
    expect(m.retencionSemanal).toEqual([
      { semana: 1, activos: { n: 1, de: 3, porcentaje: 33.3 } }, // A, B, E elegibles; solo A activa (9 oct)
      { semana: 2, activos: { n: 1, de: 3, porcentaje: 33.3 } }, // A (16 oct)
      { semana: 3, activos: { n: 0, de: 2, porcentaje: 0 } }, // E todavía no la completa; A no capturó
      { semana: 4, activos: { n: 1, de: 2, porcentaje: 50 } }, // A (30 oct)
    ]);
  });

  it('recordatorios y suscripciones', () => {
    expect(m.recordatorios).toEqual({ usuariosConRecordatoriosActivos: 4, enviadosUltimos7Dias: 5 });
    expect(m.suscripciones).toEqual({ free: 4, enPrueba: 1, proActivo: 0, pagoPendiente: 0, canceladas: 1 });
  });

  it('un instante de la noche de México, que en UTC ya es el día siguiente, cuenta como del día de México', () => {
    // Alta el 5 de octubre; captura a las 9pm del 5 (03:00 UTC del 6) -> día 0, no día 1.
    const nocturno = tenant({ altaEn: new Date('2026-10-05T16:00:00Z'), capturas: [new Date('2026-10-06T03:00:00Z')] });

    const { constanciaPrimerasDosSemanas } = calcularMetricas([nocturno], AHORA);

    expect(constanciaPrimerasDosSemanas.medianaDiasActivos).toBe(1);
  });

  it('varias capturas el mismo día son un solo día activo', () => {
    const rafaga = tenant({ altaEn: new Date('2026-10-05T16:00:00Z'), capturas: ['2026-10-05T17:00:00Z', '2026-10-05T18:00:00Z', '2026-10-05T19:00:00Z'].map((i) => new Date(i)) });

    expect(calcularMetricas([rafaga], AHORA).constanciaPrimerasDosSemanas.medianaDiasActivos).toBe(1);
  });

  it('una cohorte vacía no lanza ni inventa porcentajes: todo es null', () => {
    const vacia = calcularMetricas([], AHORA);

    expect(vacia.embudo.conPeriodo.porcentaje).toBeNull();
    expect(vacia.tiempoAlPrimerGasto.medianaHoras).toBeNull();
    expect(vacia.constanciaPrimerasDosSemanas.medianaDiasActivos).toBeNull();
    expect(vacia.retencionSemanal.every((r) => r.activos.porcentaje === null)).toBe(true);
  });

  it('la cohorte reporta su rango y su tamaño', () => {
    const acotada = calcularMetricas([A], AHORA, { desde: '2026-10-01', hasta: '2026-10-15' });
    expect(acotada.cohorte).toEqual({ desde: '2026-10-01', hasta: '2026-10-15', usuarios: 1 });
  });
});

describe('formatearReporte', () => {
  const AHORA = new Date('2026-11-10T18:00:00Z');
  const base: DatosTenant = {
    altaEn: new Date('2026-10-01T15:00:00Z'),
    plan: 'free',
    estadoSuscripcion: null,
    recibirRecordatorios: true,
    tienePeriodo: true,
    tieneIngreso: true,
    capturas: [],
    recordatoriosEnviadosUltimos7Dias: 0,
  };

  it('siempre muestra "n de N" junto al porcentaje: con cohortes chicas un porcentaje solo engaña', () => {
    const reporte = formatearReporte(calcularMetricas([base, { ...base, capturas: [new Date('2026-10-02T18:00:00Z')] }], AHORA));

    expect(reporte).toContain('1 de 2 (50%)');
    expect(reporte).toContain('2 usuarios');
  });

  it('avisa si hay usuarios con recordatorios activos pero no salió ningún correo en 7 días (el cron no corre)', () => {
    expect(formatearReporte(calcularMetricas([base], AHORA))).toContain('¿el cron está corriendo?');
  });

  it('no lanza esa alerta si sí salieron correos', () => {
    expect(formatearReporte(calcularMetricas([{ ...base, recordatoriosEnviadosUltimos7Dias: 4 }], AHORA))).not.toContain('¿el cron está corriendo?');
  });

  it('una cohorte vacía se lee sin errores ni NaN', () => {
    const reporte = formatearReporte(calcularMetricas([], AHORA));

    expect(reporte).toContain('sin base todavía');
    expect(reporte).not.toContain('NaN');
    expect(reporte).not.toContain('undefined');
  });
});
