import { cerrarSesionExpirada, esErrorDeSesion } from '@/lib/sesion-expirada';
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
  // Solo si hay body: Fastify rechaza un body vacío con Content-Type
  // application/json (FST_ERR_CTP_EMPTY_JSON_BODY) — el mismo hallazgo
  // ya documentado en backend/README.md ("Capa HTTP") para el propio
  // manejador de errores, que aquí faltaba aplicar del lado del cliente.
  // Afecta sobre todo a DELETE (eliminarGasto), que nunca manda body.
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const respuesta = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (respuesta.status === 204) {
    return undefined as T;
  }

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (sesionInvalida(respuesta.status, cuerpo?.codigo)) return new Promise<never>(() => undefined);
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? respuesta.statusText);
  }

  return cuerpo as T;
}

/**
 * Un 401 de sesión inválida cierra la sesión en cualquier pantalla y petición, en vez de mostrarse
 * como un error más. Devuelve true si la sesión se está cerrando: quien llama deja la promesa sin
 * resolver (la página se recarga en /login enseguida), para que la pantalla no alcance a mostrar
 * un "token no válido" a medias.
 */
function sesionInvalida(status: number, codigo: string | undefined): boolean {
  if (!esErrorDeSesion(status, codigo)) return false;
  cerrarSesionExpirada();
  return true;
}

/**
 * Para endpoints que devuelven un archivo (hoy solo `/exportar/*.csv`),
 * no JSON — `apiFetch` no sirve porque siempre intenta parsear el body
 * como JSON. Un `<a href>` normal tampoco alcanza: el archivo requiere
 * el header `Authorization`, que un link no puede mandar. En su lugar,
 * se pide con `fetch` directo, se arma un blob y se dispara la
 * descarga con un `<a download>` sintético — el patrón estándar para
 * descargar un archivo autenticado desde una SPA.
 */
export async function descargarArchivo(path: string, nombreArchivo: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers();
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const respuesta = await fetch(`${baseUrl}${path}`, { headers });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    if (sesionInvalida(respuesta.status, cuerpo?.codigo)) return new Promise<never>(() => undefined);
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? respuesta.statusText);
  }

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

/**
 * Simétrico a `descargarArchivo`, en la otra dirección: manda el CSV
 * como `text/csv` en el body — `apiFetch` no sirve porque siempre fuerza
 * `Content-Type: application/json` cuando hay body. La respuesta sí es
 * JSON (`{ creados, errores }`), así que el manejo de errores es igual
 * que en `apiFetch`.
 */
export async function importarCsv<T>(path: string, csvTexto: string): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers({ 'Content-Type': 'text/csv' });
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const respuesta = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: csvTexto });
  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (sesionInvalida(respuesta.status, cuerpo?.codigo)) return new Promise<never>(() => undefined);
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? respuesta.statusText);
  }

  return cuerpo as T;
}
