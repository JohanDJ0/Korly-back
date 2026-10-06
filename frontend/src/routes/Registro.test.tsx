import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { VERSION_AVISO_PRIVACIDAD, VERSION_TERMINOS } from '@/lib/datos-responsable';
import { Registro } from '@/routes/Registro';
import { renderConProveedores } from '@/test/utilidades';

beforeEach(() => {
  signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});

async function registrar(password: string, { aceptaAviso = true } = {}) {
  const usuario = userEvent.setup();
  renderConProveedores(<Registro />);
  await usuario.type(screen.getByLabelText('Correo'), 'nuevo@correo.com');
  await usuario.type(screen.getByLabelText('Contraseña', { selector: '#password' }), password);
  await usuario.type(screen.getByLabelText('Confirma tu contraseña'), password);
  if (aceptaAviso) await usuario.click(screen.getByRole('checkbox'));
  await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('Registro', () => {
  it('exige al menos 8 caracteres de contraseña y no llama a Supabase con una más corta', async () => {
    await registrar('1234567');

    expect(await screen.findByText('La contraseña necesita al menos 8 caracteres')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('con 8 caracteres y el aviso aceptado crea la cuenta y guarda la constancia de la versión del aviso', async () => {
    await registrar('12345678');

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledWith({
      email: 'nuevo@correo.com',
      password: '12345678',
      options: { data: { aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD, terminos_version: VERSION_TERMINOS, aviso_privacidad_aceptado_en: expect.any(String) } },
    });
    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
  });

  it('sin aceptar los términos y el aviso no se crea la cuenta, y los dos enlaces están a la vista', async () => {
    await registrar('12345678', { aceptaAviso: false });

    expect(await screen.findByText('Debes aceptar los términos y el aviso de privacidad para crear tu cuenta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/terminos');
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/privacidad');
    expect(signUp).not.toHaveBeenCalled();
  });
});
