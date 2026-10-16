import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { queryClient, reintentarSiFallaElServidor } from '@/lib/query-client';

const errorHttp = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('reintentarSiFallaElServidor', () => {
  it('un 4xx (404 sin periodo, 401, 400...) es un estado esperado: no se reintenta', () => {
    for (const status of [400, 401, 403, 404, 409]) expect(reintentarSiFallaElServidor(0, errorHttp(status))).toBe(false);
  });

  it('un 5xx se reintenta, dos veces como máximo', () => {
    expect(reintentarSiFallaElServidor(0, errorHttp(500))).toBe(true);
    expect(reintentarSiFallaElServidor(1, errorHttp(503))).toBe(true);
    expect(reintentarSiFallaElServidor(2, errorHttp(500))).toBe(false);
  });

  it('un fallo de red (sin status) se reintenta, dos veces como máximo', () => {
    expect(reintentarSiFallaElServidor(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(reintentarSiFallaElServidor(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('el QueryClient de la app', () => {
  it('usa esa regla para todas las consultas', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(reintentarSiFallaElServidor);
  });

  it('un 500 pasajero se arregla solo: la consulta se reintenta y la persona nunca ve el error', async () => {
    vi.useFakeTimers();
    try {
      const cliente = new QueryClient({ defaultOptions: { queries: { retry: reintentarSiFallaElServidor } } });
      const consulta = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(errorHttp(500))
        .mockResolvedValueOnce('listo');

      const resultado = cliente.fetchQuery({ queryKey: ['x'], queryFn: consulta, retry: reintentarSiFallaElServidor });
      await vi.advanceTimersByTimeAsync(1500); // la espera por omisión antes del primer reintento es de 1 s

      await expect(resultado).resolves.toBe('listo');
      expect(consulta).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un 404 no se reintenta: se muestra de inmediato (para no demorar el botón de crear la quincena)', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: reintentarSiFallaElServidor } } });
    const consulta = vi.fn<() => Promise<string>>().mockRejectedValue(errorHttp(404));

    await expect(cliente.fetchQuery({ queryKey: ['y'], queryFn: consulta })).rejects.toThrow('HTTP 404');
    expect(consulta).toHaveBeenCalledTimes(1);
  });
});
