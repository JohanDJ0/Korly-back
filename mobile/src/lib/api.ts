import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { esErrorDeSesion, marcarSesionExpirada } from '@/lib/sesion-expirada';
import { supabase } from '@/lib/supabase';

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error('Falta EXPO_PUBLIC_API_BASE_URL en mobile/.env (ver .env.example)');
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

/** La sesión ya no sirve: se cierra la local y se deja la marca para que Iniciar sesión explique por qué. */
function cerrarSesionExpirada(): void {
  marcarSesionExpirada();
  void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

/**
 * Cliente HTTP hacia la API ya desplegada — mismo contrato que la web (frontend/src/lib/api.ts). Adjunta el token de la
 * sesión activa. Una app nativa no manda `Origin`, así que el CORS del backend no le aplica.
 *
 * Diferencia con la web: allá un 401 de sesión recarga la página en /login; aquí basta con cerrar la sesión local —
 * el layout raíz escucha a Supabase y regresa solo a la pantalla de inicio de sesión.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  // Solo si hay body: Fastify rechaza un body vacío con Content-Type application/json (FST_ERR_CTP_EMPTY_JSON_BODY).
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session.access_token}`);

  const respuesta = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (respuesta.status === 204) return undefined as T;

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (esErrorDeSesion(respuesta.status, cuerpo?.codigo)) cerrarSesionExpirada();
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? `Error ${respuesta.status}`);
  }

  return cuerpo as T;
}

/**
 * Para endpoints que devuelven un archivo (hoy `/exportar/*.csv` y `/cuenta/datos`). En la web se descarga con un enlace
 * sintético; en el teléfono no hay carpeta de "Descargas" a la que escribir directo, así que el archivo se guarda en la
 * caché de la app y se abre el menú de compartir de Android (guardar en Drive, mandarlo por correo, etc.).
 */
export async function descargarArchivo(path: string, nombreArchivo: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers();
  if (session) headers.set('Authorization', `Bearer ${session.access_token}`);

  const respuesta = await fetch(`${baseUrl}${path}`, { headers });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    if (esErrorDeSesion(respuesta.status, cuerpo?.codigo)) cerrarSesionExpirada();
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? `Error ${respuesta.status}`);
  }

  const contenido = await respuesta.text();
  const archivo = new File(Paths.cache, nombreArchivo);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);

  if (!(await Sharing.isAvailableAsync())) throw new ApiError(0, 'COMPARTIR_NO_DISPONIBLE', 'Este teléfono no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, {
    mimeType: nombreArchivo.endsWith('.csv') ? 'text/csv' : 'application/json',
    dialogTitle: 'Guardar o compartir el archivo',
  });
}
