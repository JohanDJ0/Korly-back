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

import { CambiarPassword } from '@/components/CambiarPassword';
import { renderConProveedores } from '@/test/utilidades';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  useAuthStore.setState({ session: { user: { email: 'yo@correo.com' } } as never, cargando: false });
});

async function abrirYLlenar(actual: string, nueva: string, confirmar: string) {
  const usuario = userEvent.setup();
  renderConProveedores(<CambiarPassword />);
  await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  await usuario.type(screen.getByLabelText('Contraseña actual'), actual);
  await usuario.type(screen.getByLabelText('Contraseña nueva'), nueva);
  await usuario.type(screen.getByLabelText('Confirma la contraseña nueva'), confirmar);
  await usuario.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

describe('CambiarPassword', () => {
  it('empieza cerrado: solo el botón, sin campos', () => {
    renderConProveedores(<CambiarPassword />);

    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
  });

  it('comprueba la contraseña actual contra Supabase y luego guarda la nueva', async () => {
    await abrirYLlenar('vieja-clave', 'nueva-clave-1', 'nueva-clave-1');

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'nueva-clave-1' }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'yo@correo.com', password: 'vieja-clave', options: { captchaToken: undefined } });
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]!);
    expect(await screen.findByRole('status')).toHaveTextContent('Listo — tu contraseña se actualizó.');
  });

  it('si la contraseña actual es incorrecta, lo dice en español y NO cambia nada', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    await abrirYLlenar('equivocada', 'nueva-clave-1', 'nueva-clave-1');

    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña nueva de menos de 8 caracteres sin llamar a Supabase', async () => {
    await abrirYLlenar('vieja-clave', 'corta', 'corta');

    expect(await screen.findByText('La contraseña necesita al menos 8 caracteres')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rechaza una confirmación que no coincide', async () => {
    await abrirYLlenar('vieja-clave', 'nueva-clave-1', 'nueva-clave-2');

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('si Supabase rechaza la nueva por ser igual a la actual, lo explica', async () => {
    updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } });

    await abrirYLlenar('vieja-clave', 'nueva-clave-1', 'nueva-clave-1');

    expect(await screen.findByText('La contraseña nueva debe ser distinta a la actual')).toBeInTheDocument();
  });

  it('Cancelar cierra el formulario sin llamar a Supabase', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<CambiarPassword />);

    await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
