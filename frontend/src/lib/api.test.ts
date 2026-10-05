import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock se eleva al inicio del archivo: lo que usan sus fábricas tiene que crearse con vi.hoisted.
const { getSession, cerrarSesionExpirada } = vi.hoisted(() => ({ getSession: vi.fn(), cerrarSesionExpirada: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('@/lib/sesion-expirada', async (original) => ({
  ...(await original<typeof import('@/lib/sesion-expirada')>()),
  cerrarSesionExpirada,
}));

import { ApiError, apiFetch, descargarArchivo, importarCsv } from '@/lib/api';

function responder(status: number, cuerpo?: unknown, init: ResponseInit = {}) {
  const texto = cuerpo === undefined ? null : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  return new Response(status === 204 ? null : texto, { status, ...init });
}

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  cerrarSesionExpirada.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-de-prueba' } } });
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `true` si la promesa NO se resolvió ni rechazó en un rato razonable (se queda esperando a que la página recargue). */
async function sigueSinResolver(promesa: Promise<unknown>): Promise<boolean> {
  const marca = Symbol('pendiente');
  const resultado = await Promise.race([promesa.then(() => 'resuelta', () => 'rechazada'), new Promise((r) => setTimeout(() => r(marca), 50))]);
  return resultado === marca;
}

describe('apiFetch', () => {
  it('manda el token de la sesión y devuelve el JSON', async () => {
    fetchSimulado.mockResolvedValue(responder(200, { estado: 'ok' }));

    const datos = await apiFetch<{ estado: string }>('/periodos/activo');

    expect(datos).toEqual({ estado: 'ok' });
    const [url, init] = fetchSimulado.mock.calls[0]!;
    expect(url).toBe('http://api.prueba.local/v1/periodos/activo');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('pone Content-Type JSON solo cuando hay cuerpo (Fastify rechaza un DELETE vacío con ese encabezado)', async () => {
    fetchSimulado.mockResolvedValue(responder(204));

    await apiFetch('/gastos/1', { method: 'DELETE' });
    await apiFetch('/gastos', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    expect(new Headers(fetchSimulado.mock.calls[0]![1].headers).get('Content-Type')).toBeNull();
    expect(new Headers(fetchSimulado.mock.calls[1]![1].headers).get('Content-Type')).toBe('application/json');
  });

  it('un 204 devuelve undefined', async () => {
    fetchSimulado.mockResolvedValue(responder(204));

    await expect(apiFetch('/gastos/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('un error de dominio llega como ApiError con su código y su mensaje, sin tocar la sesión', async () => {
    fetchSimulado.mockResolvedValue(responder(409, { codigo: 'APORTE_EXCEDE_DISPONIBLE', mensaje: 'El aporte supera lo que tienes disponible en tu quincena' }));

    const error = await apiFetch('/metas/1/aportes', { method: 'POST', body: '{}' }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, codigo: 'APORTE_EXCEDE_DISPONIBLE', message: 'El aporte supera lo que tienes disponible en tu quincena' });
    expect(cerrarSesionExpirada).not.toHaveBeenCalled();
  });

  it('un error sin cuerpo JSON no revienta: ERROR_DESCONOCIDO con el texto del estado', async () => {
    fetchSimulado.mockResolvedValue(responder(502, 'Bad Gateway', { statusText: 'Bad Gateway' }));

    const error = await apiFetch('/metas').catch((e) => e);

    expect(error).toMatchObject({ status: 502, codigo: 'ERROR_DESCONOCIDO' });
  });

  it.each(['TOKEN_INVALIDO', 'NO_AUTENTICADO'])('un 401 %s cierra la sesión y deja la petición pendiente (sin pintar el error)', async (codigo) => {
    fetchSimulado.mockResolvedValue(responder(401, { codigo, mensaje: 'El token no es válido o expiró' }));

    const promesa = apiFetch('/metas');

    expect(await sigueSinResolver(promesa)).toBe(true);
    expect(cerrarSesionExpirada).toHaveBeenCalledTimes(1);
  });

  it('un 503 de autenticación NO cierra la sesión: el usuario conserva una sesión buena', async () => {
    fetchSimulado.mockResolvedValue(responder(503, { codigo: 'AUTENTICACION_NO_DISPONIBLE', mensaje: 'No se pudo verificar tu sesión en este momento.' }));

    const error = await apiFetch('/metas').catch((e) => e);

    expect(error).toMatchObject({ status: 503, codigo: 'AUTENTICACION_NO_DISPONIBLE' });
    expect(cerrarSesionExpirada).not.toHaveBeenCalled();
  });

  it('sin sesión no manda Authorization y deja que el backend decida (responde 401)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchSimulado.mockResolvedValue(responder(401, { codigo: 'NO_AUTENTICADO', mensaje: 'Falta el encabezado' }));

    void apiFetch('/metas');
    await vi.waitFor(() => expect(fetchSimulado).toHaveBeenCalled());

    expect(new Headers(fetchSimulado.mock.calls[0]![1].headers).get('Authorization')).toBeNull();
    await vi.waitFor(() => expect(cerrarSesionExpirada).toHaveBeenCalled());
  });
});

describe('descargarArchivo e importarCsv también cierran la sesión con un 401', () => {
  it('descargarArchivo', async () => {
    fetchSimulado.mockResolvedValue(responder(401, { codigo: 'TOKEN_INVALIDO', mensaje: 'x' }));

    expect(await sigueSinResolver(descargarArchivo('/exportar/gastos.csv', 'gastos.csv'))).toBe(true);
    expect(cerrarSesionExpirada).toHaveBeenCalledTimes(1);
  });

  it('importarCsv', async () => {
    fetchSimulado.mockResolvedValue(responder(401, { codigo: 'TOKEN_INVALIDO', mensaje: 'x' }));

    expect(await sigueSinResolver(importarCsv('/periodos/1/gastos/importar', 'fecha,monto\n'))).toBe(true);
    expect(cerrarSesionExpirada).toHaveBeenCalledTimes(1);
  });

  it('importarCsv manda el CSV como text/csv y devuelve el resultado', async () => {
    fetchSimulado.mockResolvedValue(responder(201, { creados: 2, errores: [] }));

    const resultado = await importarCsv('/periodos/1/gastos/importar', 'fecha,monto\n2026-10-01,100\n');

    expect(resultado).toEqual({ creados: 2, errores: [] });
    expect(new Headers(fetchSimulado.mock.calls[0]![1].headers).get('Content-Type')).toBe('text/csv');
  });
});
