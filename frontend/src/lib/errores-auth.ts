/**
 * Mensajes de error de Supabase Auth en español. Supabase los manda en inglés ("Invalid login credentials"); aquí se
 * traducen a algo que una persona entienda, por su `code` estable (supabase-js lo trae en `AuthError.code`) y, si no
 * lo trae, por el texto. Los errores del backend propio ya vienen en español (lib/api.ts) y no pasan por aquí.
 *
 * `contexto` cambia lo que significa "credenciales inválidas": al iniciar sesión es "correo o contraseña", pero al
 * cambiar la contraseña o el correo (se vuelve a verificar la contraseña actual) es solo "la contraseña actual".
 * Un mensaje que no se reconoce no se muestra en inglés: sale uno genérico en español, para no dejar a la persona con
 * texto que no entiende (y sin pistas que le sirvan a quien intenta adivinar cuentas).
 */
export type ContextoErrorAuth = 'general' | 'login' | 'reautenticar';

export interface ErrorDeAuth {
  message: string;
  code?: string;
}

const MENSAJE_GENERICO = 'Algo salió mal. Inténtalo de nuevo en un momento.';

export function mensajeDeErrorAuth(error: ErrorDeAuth, contexto: ContextoErrorAuth = 'general'): string {
  const codigo = error.code ?? '';
  const texto = error.message ?? '';
  const es = (codigos: string[], patron: RegExp) => codigos.includes(codigo) || patron.test(texto);

  if (es(['invalid_credentials'], /invalid login credentials/i)) {
    if (contexto === 'login') return 'El correo o la contraseña no son correctos';
    if (contexto === 'reautenticar') return 'La contraseña actual no es correcta';
    return 'Los datos no son correctos';
  }
  if (es(['email_not_confirmed'], /email not confirmed/i)) {
    return 'Todavía no confirmas tu correo. Revisa tu bandeja (y la carpeta de spam) y toca el botón del correo que te mandamos.';
  }
  if (es(['same_password'], /different from the old password/i)) return 'La contraseña nueva debe ser distinta a la actual';
  if (es(['weak_password'], /password should be at least|weak password|password is too (weak|short)/i)) {
    return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
  }
  if (es(['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'], /rate limit|too many requests|only request this after|security purposes/i)) {
    return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo';
  }
  if (es(['user_already_exists', 'email_exists'], /already (been )?registered|already exists/i)) return 'Ese correo ya está en uso';
  if (es(['email_address_invalid', 'validation_failed'], /unable to validate email|email address .* is invalid|invalid format/i)) return 'Ese correo no parece válido';
  if (es(['captcha_failed'], /captcha/i)) return 'No pudimos verificar que eres una persona. Inténtalo de nuevo.';
  if (es(['otp_expired', 'flow_state_expired', 'flow_state_not_found'], /expired|token is invalid|link is invalid/i)) {
    return 'El enlace ya venció o no es válido. Pide uno nuevo.';
  }
  if (es(['session_not_found', 'session_expired', 'refresh_token_not_found'], /session (missing|not found|expired)|refresh token/i)) {
    return 'Tu sesión terminó. Inicia sesión de nuevo.';
  }
  if (es(['signup_disabled'], /signups? (not allowed|disabled)/i)) return 'El registro no está disponible por ahora.';
  if (es(['user_banned'], /banned/i)) return 'Esta cuenta no está disponible.';
  if (/failed to fetch|network ?error|network request failed|fetch failed|retryable/i.test(texto)) {
    return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.';
  }
  return MENSAJE_GENERICO;
}
