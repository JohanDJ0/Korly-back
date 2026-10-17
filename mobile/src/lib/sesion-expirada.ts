/**
 * Equivale a frontend/src/lib/sesion-expirada.ts: cuando la API responde que la sesión ya no sirve (401 TOKEN_INVALIDO o
 * NO_AUTENTICADO) la app cierra la sesión local y vuelve sola a Iniciar sesión; esta marca hace que esa pantalla explique
 * por qué ("Tu sesión expiró"). En el teléfono no hace falta guardarla en disco: la app no se recarga, sigue en memoria.
 */
let expiro = false;

/** Los dos códigos con los que el backend dice "esta sesión ya no sirve" (ver backend/src/shared/auth.ts). */
export function esErrorDeSesion(status: number, codigo: string | undefined): boolean {
  return status === 401 && (codigo === 'TOKEN_INVALIDO' || codigo === 'NO_AUTENTICADO');
}

export function marcarSesionExpirada(): void {
  expiro = true;
}

/** Solo lee: Iniciar sesión la consulta al montarse. */
export function haySesionExpirada(): boolean {
  return expiro;
}

/** Se limpia al iniciar sesión de nuevo. */
export function limpiarSesionExpirada(): void {
  expiro = false;
}
