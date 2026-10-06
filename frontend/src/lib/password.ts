import { z } from 'zod';

/**
 * Mínimo para ELEGIR una contraseña (registro, restablecer, cambiar). El login
 * no lo exige a propósito: las cuentas creadas con el mínimo anterior (6) deben
 * poder seguir entrando. Esto es solo la primera barrera, la del navegador: el
 * mínimo que cuenta de verdad es el de Supabase Auth (Authentication → Sign In /
 * Providers → Email → "Minimum password length"), que hay que subir a este mismo valor.
 */
export const LONGITUD_MINIMA_PASSWORD = 8;

export const esquemaPasswordNueva = z.string().min(LONGITUD_MINIMA_PASSWORD, `La contraseña necesita al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`);

/** Traduce los mensajes en inglés de Supabase Auth que el usuario puede ver al cambiar su contraseña o su correo. */
export function traducirErrorDeAuth(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'La contraseña actual no es correcta';
  if (/different from the old password/i.test(mensaje)) return 'La contraseña nueva debe ser distinta a la actual';
  if (/rate limit|too many requests|only request this after/i.test(mensaje)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo';
  if (/already (been )?registered|already exists/i.test(mensaje)) return 'Ese correo ya está en uso';
  return mensaje;
}
