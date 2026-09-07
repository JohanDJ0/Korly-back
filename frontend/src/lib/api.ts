import { supabase } from '@/lib/supabase';

const baseUrl = import.meta.env.VITE_API_BASE_URL;

if (!baseUrl) {
  throw new Error('Falta VITE_API_BASE_URL en el .env (ver .env.example)');
}

/** Misma forma que ErrorDominio del backend: {codigo, mensaje} (ver backend/src/shared/errores.ts). */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
  }
}

/**
 * Cliente HTTP delgado hacia el backend propio — nunca hacia Supabase
 * directo salvo Auth (ver lib/supabase.ts). Adjunta el token de la sesión
 * activa en cada request; si no hay sesión, deja que el backend responda
 * 401 en vez de bloquear la llamada aquí (mantiene un solo lugar —el
 * backend— que decide qué es "no autenticado").
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const respuesta = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (respuesta.status === 204) {
    return undefined as T;
  }

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? respuesta.statusText);
  }

  return cuerpo as T;
}
