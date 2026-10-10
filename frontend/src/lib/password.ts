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
