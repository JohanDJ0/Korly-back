/**
 * A dónde volver después de iniciar sesión. `ProtectedRoute` manda a /login con el lugar al que se quería
 * entrar (por ejemplo `/?gasto=1`, el enlace del recordatorio por correo) en el estado de la navegación;
 * Login lo lee para no tirar al usuario siempre en `/`. Solo se aceptan rutas internas de la app: aunque el
 * estado solo lo escribe la propia app, un valor raro (`//otro.sitio`, `https://…`, `/login`) cae en `/`.
 */
export const DESTINO_POR_DEFECTO = '/';

export interface EstadoLogin {
  desde?: string;
}

export function destinoTrasLogin(estado: unknown): string {
  const desde = (estado as EstadoLogin | null | undefined)?.desde;
  if (typeof desde !== 'string') return DESTINO_POR_DEFECTO;
  if (!desde.startsWith('/') || desde.startsWith('//') || desde.includes('\\')) return DESTINO_POR_DEFECTO;
  if (/^\/(login|registro|olvide-password)(\/|\?|#|$)/.test(desde)) return DESTINO_POR_DEFECTO;
  return desde;
}
