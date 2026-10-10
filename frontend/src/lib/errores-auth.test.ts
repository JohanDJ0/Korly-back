import { describe, expect, it } from 'vitest';

import { mensajeDeErrorAuth } from '@/lib/errores-auth';

describe('mensajeDeErrorAuth — Supabase Auth en español', () => {
  it('credenciales inválidas: al iniciar sesión habla de correo y contraseña; al reverificar, de la contraseña actual', () => {
    const error = { message: 'Invalid login credentials', code: 'invalid_credentials' };

    expect(mensajeDeErrorAuth(error, 'login')).toBe('El correo o la contraseña no son correctos');
    expect(mensajeDeErrorAuth(error, 'reautenticar')).toBe('La contraseña actual no es correcta');
    expect(mensajeDeErrorAuth(error)).toBe('Los datos no son correctos');
  });

  it('reconoce el error por su texto cuando Supabase no manda código', () => {
    expect(mensajeDeErrorAuth({ message: 'Invalid login credentials' }, 'login')).toBe('El correo o la contraseña no son correctos');
  });

  it.each([
    [{ message: 'Email not confirmed', code: 'email_not_confirmed' }, /no confirmas tu correo/],
    [{ message: 'New password should be different from the old password.', code: 'same_password' }, /distinta a la actual/],
    [{ message: 'Password should be at least 8 characters.', code: 'weak_password' }, /muy débil/],
    [{ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }, /Demasiados intentos/],
    [{ message: 'For security purposes, you can only request this after 45 seconds.' }, /Demasiados intentos/],
    [{ message: 'User already registered', code: 'user_already_exists' }, /ya está en uso/],
    [{ message: 'Unable to validate email address: invalid format' }, /no parece válido/],
    [{ message: 'captcha verification process failed', code: 'captcha_failed' }, /verificar que eres una persona/],
    [{ message: 'Email link is invalid or has expired', code: 'otp_expired' }, /enlace ya venció/],
    [{ message: 'Auth session missing!' }, /sesión terminó/],
    [{ message: 'Signups not allowed for this instance', code: 'signup_disabled' }, /no está disponible/],
    [{ message: 'User is banned', code: 'user_banned' }, /no está disponible/],
    [{ message: 'Failed to fetch' }, /No pudimos conectarnos/],
  ])('traduce %j', (error, esperado) => {
    expect(mensajeDeErrorAuth(error)).toMatch(esperado);
  });

  it('un error que no se reconoce no sale en inglés: sale un mensaje genérico en español', () => {
    const mensaje = mensajeDeErrorAuth({ message: 'Database error saving new user' });

    expect(mensaje).toBe('Algo salió mal. Inténtalo de nuevo en un momento.');
    expect(mensaje).not.toMatch(/database/i);
  });

  it('ninguna traducción contiene texto en inglés de Supabase', () => {
    const casos = [
      { message: 'Invalid login credentials' },
      { message: 'Email not confirmed' },
      { message: 'Password should be at least 8 characters' },
      { message: 'User already registered' },
      { message: 'Something unexpected' },
    ];
    for (const caso of casos) {
      for (const contexto of ['general', 'login', 'reautenticar'] as const) {
        expect(mensajeDeErrorAuth(caso, contexto)).not.toMatch(/invalid|confirmed|should|already|unexpected|credentials/i);
      }
    }
  });
});
