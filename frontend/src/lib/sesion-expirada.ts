import { supabase } from '@/lib/supabase';

const CLAVE_AVISO = 'korly:sesion-expirada';
let cerrando = false;

/** Los dos códigos con los que el backend dice "esta sesión ya no sirve" (ver backend/src/shared/auth.ts). */
export function esErrorDeSesion(status: number, codigo: string | undefined): boolean {
  return status === 401 && (codigo === 'TOKEN_INVALIDO' || codigo === 'NO_AUTENTICADO');
}

/**
 * La sesión expiró o ya no es válida: se cierra y se vuelve a /login con una carga
 * completa de la página, en vez de dejar pantallas con "token no válido" a medias.
 * La navegación completa (no un `navigate`) también descarta cualquier estado en
 * memoria de la sesión anterior. `cerrando` evita repetirlo cuando varias peticiones
 * fallan a la vez. El cierre es local (`scope: 'local'`): no depende de que el
 * servidor de Auth conteste, justo cuando la sesión ya no es válida.
 */
export function cerrarSesionExpirada(): void {
  if (cerrando) return;
  cerrando = true;
  try {
    sessionStorage.setItem(CLAVE_AVISO, '1');
  } catch {
    // Sin sessionStorage solo se pierde el aviso; el cierre de sesión sigue igual.
  }
  void supabase.auth
    .signOut({ scope: 'local' })
    .catch(() => undefined)
    .finally(() => window.location.replace('/login'));
}

/** Para que /login explique por qué se cerró la sesión. Solo lee: es idempotente (React puede llamarlo dos veces al montar). */
export function hayAvisoSesionExpirada(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_AVISO) === '1';
  } catch {
    return false;
  }
}

/**
 * Se llama al iniciar sesión de nuevo, no al mostrar el aviso: el cierre de sesión redirige primero dentro de
 * la app y luego recarga la página, así que /login se monta dos veces y el aviso debe sobrevivir a ambas.
 */
export function limpiarAvisoSesionExpirada(): void {
  try {
    sessionStorage.removeItem(CLAVE_AVISO);
  } catch {
    // Sin sessionStorage no hay nada que limpiar.
  }
}
