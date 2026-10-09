import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPassword, updateUser } = vi.hoisted(() => ({ signInWithPassword: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword,
      updateUser,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { CambiarCorreo } from '@/components/CambiarCorreo';
import { renderConProveedores } from '@/test/utilidades';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  useAuthStore.setState({ session: { user: { email: 'yo@correo.com' } } as never, cargando: false });
});

async function abrirYLlenar(nuevoCorreo: string, password: string) {
  const usuario = userEvent.setup();
  renderConProveedores(<CambiarCorreo />);
  await usuario.click(screen.getByRole('button', { name: 'Cambiar correo' }));
  await usuario.type(screen.getByLabelText('Correo nuevo'), nuevoCorreo);
  await usuario.type(screen.getByLabelText('Tu contraseña'), password);
  await usuario.click(screen.getByRole('button', { name: 'Enviar enlace de confirmación' }));
}

describe('CambiarCorreo', () => {
  it('comprueba la contraseña, pide el cambio y avisa que hay que confirmar desde los correos (no cambia al instante)', async () => {
    await abrirYLlenar('nuevo@correo.com', 'mi-clave');

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ email: 'nuevo@correo.com' }, { emailRedirectTo: window.location.origin }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'mi-clave', options: { captchaToken: undefined } });
    expect(await screen.findByRole('status')).toHaveTextContent('Te enviamos un enlace de confirmación a tu correo actual y a nuevo@correo.com');
  });

  it('con la contraseña incorrecta no pide el cambio', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    await abrirYLlenar('nuevo@correo.com', 'mala');

    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido sin llamar a Supabase', async () => {
    await abrirYLlenar('no-es-correo', 'mi-clave');

    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rechaza escribir el mismo correo que ya tiene la cuenta, aunque cambien las mayúsculas', async () => {
    await abrirYLlenar('YO@correo.com', 'mi-clave');

    expect(await screen.findByText('Ese ya es el correo de tu cuenta')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('si el correo nuevo ya lo usa otra cuenta, lo dice en español', async () => {
    updateUser.mockResolvedValue({ error: { message: 'A user with this email address has already been registered' } });

    await abrirYLlenar('otro@correo.com', 'mi-clave');

    expect(await screen.findByText('Ese correo ya está en uso')).toBeInTheDocument();
  });
});
