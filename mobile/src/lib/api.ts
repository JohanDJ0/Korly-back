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

/** Los dos códigos con los que el backend dice "esta sesión ya no sirve" (ver backend/src/shared/auth.ts). */
function esErrorDeSesion(status: number, codigo: string | undefined): boolean {
  return status === 401 && (codigo === 'TOKEN_INVALIDO' || codigo === 'NO_AUTENTICADO');
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
    if (esErrorDeSesion(respuesta.status, cuerpo?.codigo)) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    throw new ApiError(respuesta.status, cuerpo?.codigo ?? 'ERROR_DESCONOCIDO', cuerpo?.mensaje ?? `Error ${respuesta.status}`);
  }

  return cuerpo as T;
}
