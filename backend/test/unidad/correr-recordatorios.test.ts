import { describe, expect, it, vi } from 'vitest';
import { correrRecordatorios, type DependenciasJob } from '../../src/modulos/notificaciones/correr-recordatorios.js';
import { vaciarObservabilidad } from '../../src/shared/observabilidad.js';

function dependencias(parciales: Partial<DependenciasJob> = {}): DependenciasJob {
  return {
    listarTenants: async () => [],
    procesar: async (tenantId) => ({ tenantId, enviado: true }),
    reportarError: vi.fn(),
    registrarError: vi.fn(),
    ahora: () => new Date('2026-10-05T02:00:00Z'),
    ...parciales,
  };
}

describe('correrRecordatorios', () => {
  it('procesa cada tenant con la misma fecha de referencia y resume la corrida', async () => {
    const procesar = vi.fn(async (tenantId: string) => (tenantId === 'a' ? { tenantId, enviado: true } : { tenantId, enviado: false, motivo: 'ya_registro_hoy' as const }));

    const { resumen, fallidos } = await correrRecordatorios(dependencias({ listarTenants: async () => ['a', 'b'], procesar }));

    expect(procesar.mock.calls).toEqual([
      ['a', new Date('2026-10-05T02:00:00Z')],
      ['b', new Date('2026-10-05T02:00:00Z')],
    ]);
    expect(fallidos).toBe(0);
    expect(resumen).toBe('tenants: 2 — enviados: 1, omitidos: 1 (ya_registro_hoy: 1), fallidos: 0');
  });

  it('un tenant que falla se reporta a Sentry y NO detiene a los demás', async () => {
    const error = new Error('Resend rechazó el envío');
    const reportarError = vi.fn();
    const registrarError = vi.fn();
    const procesar = vi.fn(async (tenantId: string) => {
      if (tenantId === 'malo') throw error;
      return { tenantId, enviado: true };
    });

    const { resumen, fallidos } = await correrRecordatorios(dependencias({ listarTenants: async () => ['uno', 'malo', 'tres'], procesar, reportarError, registrarError }));

    expect(procesar).toHaveBeenCalledTimes(3); // siguió con 'tres' después del fallo
    expect(reportarError).toHaveBeenCalledTimes(1);
    expect(reportarError).toHaveBeenCalledWith(error);
    expect(registrarError).toHaveBeenCalledWith('[recordatorios] tenant malo falló:', error);
    expect(fallidos).toBe(1);
    expect(resumen).toContain('enviados: 2');
    expect(resumen).toContain('fallidos: 1');
  });

  it('cada tenant fallido se reporta por separado', async () => {
    const reportarError = vi.fn();

    await correrRecordatorios(
      dependencias({
        listarTenants: async () => ['a', 'b', 'c'],
        procesar: async () => {
          throw new Error('x');
        },
        reportarError,
      })
    );

    expect(reportarError).toHaveBeenCalledTimes(3);
  });

  it('sin tenants con recordatorios activos, termina sin error y sin enviar nada', async () => {
    const { resumen, fallidos } = await correrRecordatorios(dependencias());

    expect(fallidos).toBe(0);
    expect(resumen).toBe('tenants: 0 — enviados: 0, omitidos: 0, fallidos: 0');
  });

  it('si ni siquiera se pueden listar los tenants, el error se propaga (el script lo reporta y sale con código 1)', async () => {
    const error = new Error('la base de datos no contesta');

    await expect(correrRecordatorios(dependencias({ listarTenants: async () => Promise.reject(error) }))).rejects.toBe(error);
  });
});

describe('vaciarObservabilidad', () => {
  it('sin Sentry inicializado responde enseguida y no lanza (desarrollo, CI)', async () => {
    delete process.env.SENTRY_DSN;

    await expect(vaciarObservabilidad(50)).resolves.toBeTypeOf('boolean');
  });
});
