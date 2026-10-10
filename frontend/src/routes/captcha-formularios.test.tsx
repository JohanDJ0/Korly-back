import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPassword, signUp, resetPasswordForEmail, updateUser } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword,
      signUp,
      resetPasswordForEmail,
      updateUser,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { CambiarCorreo } from '@/components/CambiarCorreo';
import { CambiarPassword } from '@/components/CambiarPassword';
import { reiniciarCargaTurnstileParaPruebas } from '@/lib/turnstile';
import { Login } from '@/routes/Login';
import { OlvidePassword } from '@/routes/OlvidePassword';
import { Registro } from '@/routes/Registro';
import { useAuthStore } from '@/stores/auth-store';
import { renderConProveedores } from '@/test/utilidades';
import { instalarTurnstileFalso, quitarTurnstileFalso, type TurnstileFalso } from '@/test/turnstile-falso';

/**
 * Captcha de Turnstile en los formularios que le hablan a Supabase Auth. La regla que importa: con la llave del sitio
 * puesta, NADA se manda sin un token, y cada token se usa una sola vez.
 */
let turnstile: TurnstileFalso;

beforeEach(() => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'llave-publica-de-prueba');
  turnstile = instalarTurnstileFalso();
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  useAuthStore.setState({ session: { user: { email: 'yo@correo.com' } } as never, cargando: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  quitarTurnstileFalso();
  reiniciarCargaTurnstileParaPruebas();
});

const sinSesion = () => useAuthStore.setState({ session: null, cargando: false });

describe('Login con captcha', () => {
  async function llenar() {
    sinSesion();
    const usuario = userEvent.setup();
    renderConProveedores(<Login />);
    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta');
    return usuario;
  }

  it('dibuja el widget con la llave pública, en modo discreto y tema oscuro', async () => {
    sinSesion();
    renderConProveedores(<Login />);

    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    expect(turnstile.dibujados[0]?.opciones).toMatchObject({ sitekey: 'llave-publica-de-prueba', theme: 'dark', appearance: 'interaction-only' });
  });

  it('si se intenta entrar antes de que termine la verificación, no se llama a Supabase y se le explica a la persona', async () => {
    const usuario = await llenar();
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/estamos verificando que eres una persona/)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('con el token listo lo manda a Supabase, y después pide uno nuevo (el token es de un solo uso)', async () => {
    const usuario = await llenar();
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-1'));

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'secreta', options: { captchaToken: 'token-1' } }));
    expect(turnstile.api.reset).toHaveBeenCalledWith('widget-1');
  });

  it('si el inicio de sesión falla, también se reinicia el widget para poder reintentar', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const usuario = await llenar();
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-1'));

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('El correo o la contraseña no son correctos')).toBeInTheDocument();
    expect(turnstile.api.reset).toHaveBeenCalled();
  });

  it('si Cloudflare falla (error-callback), avisa qué hacer', async () => {
    sinSesion();
    renderConProveedores(<Login />);
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));

    act(() => turnstile.dibujados[0]?.opciones['error-callback']?.('110200'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos completar la verificación de seguridad/);
    expect(screen.getByRole('alert')).toHaveTextContent('Código: 110200'); // para poder diagnosticarlo sin abrir la consola
  });

  it('si después de un error Cloudflare logra verificar, el aviso desaparece', async () => {
    sinSesion();
    renderConProveedores(<Login />);
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.dibujados[0]?.opciones['error-callback']?.('300030'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    act(() => turnstile.resolver('token-tras-reintento'));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('si el token expira antes de enviar, vuelve a exigir uno nuevo', async () => {
    const usuario = await llenar();
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-1'));
    act(() => turnstile.dibujados[0]?.opciones['expired-callback']?.());

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/estamos verificando/)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('al desmontar el formulario se quita el widget', async () => {
    sinSesion();
    const { unmount } = renderConProveedores(<Login />);
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));

    unmount();

    expect(turnstile.api.remove).toHaveBeenCalledWith('widget-1');
  });
});

describe('Registro y recuperar contraseña con captcha', () => {
  it('Registro manda el token junto con la constancia del aviso, y no crea la cuenta sin él', async () => {
    sinSesion();
    const usuario = userEvent.setup();
    renderConProveedores(<Registro />);
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    await usuario.type(screen.getByLabelText('Correo'), 'nuevo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña', { selector: '#password' }), '12345678');
    await usuario.type(screen.getByLabelText('Confirma tu contraseña'), '12345678');
    await usuario.click(screen.getByRole('checkbox'));

    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText(/estamos verificando/)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();

    act(() => turnstile.resolver('token-registro'));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ email: 'nuevo@correo.com', options: { captchaToken: 'token-registro', data: { terminos_version: expect.any(String) } } });
  });

  it('Olvidé mi contraseña manda el token a Supabase', async () => {
    sinSesion();
    const usuario = userEvent.setup();
    renderConProveedores(<OlvidePassword />);
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-olvide'));
    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');

    await usuario.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('yo@correo.com', { redirectTo: window.location.origin, captchaToken: 'token-olvide' }));
  });
});

describe('Cambiar contraseña / correo (dentro de Ajustes) con captcha', () => {
  it('el widget solo existe mientras el formulario está abierto, y la verificación de la contraseña lleva el token', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<CambiarPassword />);
    expect(turnstile.dibujados).toHaveLength(0); // cerrado: nada que verificar todavía

    await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-ajustes'));
    await usuario.type(screen.getByLabelText('Contraseña actual'), 'vieja-clave');
    await usuario.type(screen.getByLabelText('Contraseña nueva'), 'nueva-clave-1');
    await usuario.type(screen.getByLabelText('Confirma la contraseña nueva'), 'nueva-clave-1');
    await usuario.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'vieja-clave', options: { captchaToken: 'token-ajustes' } }));
    expect(updateUser).toHaveBeenCalledWith({ password: 'nueva-clave-1' });
  });

  it('cambiar el correo también manda el token al comprobar la contraseña', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<CambiarCorreo />);
    await usuario.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    await waitFor(() => expect(turnstile.dibujados).toHaveLength(1));
    act(() => turnstile.resolver('token-correo'));
    await usuario.type(screen.getByLabelText('Correo nuevo'), 'nuevo@correo.com');
    await usuario.type(screen.getByLabelText('Tu contraseña'), 'mi-clave');

    await usuario.click(screen.getByRole('button', { name: 'Enviar enlace de confirmación' }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'mi-clave', options: { captchaToken: 'token-correo' } }));
  });
});

describe('sin llave del sitio (captcha apagado)', () => {
  it('no dibuja ningún widget y el formulario funciona como siempre, sin pedir token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    sinSesion();
    const usuario = userEvent.setup();
    renderConProveedores(<Login />);
    await usuario.type(screen.getByLabelText('Correo'), 'yo@correo.com');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta');

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1));
    expect(turnstile.dibujados).toHaveLength(0);
    expect(screen.queryByTestId('captcha-turnstile')).not.toBeInTheDocument();
  });
});
