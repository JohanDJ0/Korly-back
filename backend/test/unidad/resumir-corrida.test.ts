import { describe, expect, it } from 'vitest';
import { resumirCorrida, type ResultadoRecordatorioDiario } from '../../src/modulos/notificaciones/enviar-recordatorios.js';

const enviado = (): ResultadoRecordatorioDiario => ({ tenantId: 't', enviado: true });
const omitido = (motivo: NonNullable<ResultadoRecordatorioDiario['motivo']>): ResultadoRecordatorioDiario => ({ tenantId: 't', enviado: false, motivo });

describe('resumirCorrida', () => {
  it('desglosa los omitidos por motivo, del más frecuente al menos', () => {
    const linea = resumirCorrida([enviado(), omitido('ya_registro_hoy'), omitido('ya_registro_hoy'), omitido('sin_correo')], 0);

    expect(linea).toBe('tenants: 4 — enviados: 1, omitidos: 3 (ya_registro_hoy: 2, sin_correo: 1), fallidos: 0');
  });

  it('con empate de frecuencia ordena por nombre, para que la línea sea estable', () => {
    const linea = resumirCorrida([omitido('sin_correo'), omitido('en_backoff')], 0);

    expect(linea).toContain('(en_backoff: 1, sin_correo: 1)');
  });

  it('los fallidos cuentan como tenants pero no como omitidos', () => {
    const linea = resumirCorrida([enviado()], 2);

    expect(linea).toBe('tenants: 3 — enviados: 1, omitidos: 0, fallidos: 2');
  });

  it('sin omitidos no deja paréntesis vacíos', () => {
    expect(resumirCorrida([enviado(), enviado()], 0)).toBe('tenants: 2 — enviados: 2, omitidos: 0, fallidos: 0');
  });

  it('una corrida vacía no lanza', () => {
    expect(resumirCorrida([], 0)).toBe('tenants: 0 — enviados: 0, omitidos: 0, fallidos: 0');
  });

  it('un omitido sin motivo se reporta como desconocido en vez de perderse', () => {
    expect(resumirCorrida([{ tenantId: 't', enviado: false }], 0)).toContain('(desconocido: 1)');
  });

  it('no incluye ids de tenant en la línea', () => {
    const linea = resumirCorrida([{ tenantId: '0b9f2f9e-1111-2222-3333-444455556666', enviado: false, motivo: 'sin_correo' }], 0);

    expect(linea).not.toContain('0b9f2f9e');
  });
});
