import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateUser, signOut } = vi.hoisted(() => ({ updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser,
      signOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { ReaceptarAviso } from '@/components/ReaceptarAviso';
import { VERSION_AVISO_PRIVACIDAD, VERSION_TERMINOS, aceptoAvisoVigente } from '@/lib/datos-responsable';
import { renderConProveedores } from '@/test/utilidades';

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset();
});

describe('aceptoAvisoVigente', () => {
  it('solo la versión vigente cuenta; una anterior o ninguna constancia, no', () => {
    expect(aceptoAvisoVigente({ aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD, terminos_version: VERSION_TERMINOS })).toBe(true);
    expect(aceptoAvisoVigente({ aviso_privacidad_version: '2026-09-01', terminos_version: VERSION_TERMINOS })).toBe(false);
    // Cuentas que solo aceptaron el aviso (antes de que existieran los términos) también tienen que aceptar otra vez.
    expect(aceptoAvisoVigente({ aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD })).toBe(false);
    expect(aceptoAvisoVigente({ terminos_version: VERSION_TERMINOS })).toBe(false);
    expect(aceptoAvisoVigente({})).toBe(false);
    expect(aceptoAvisoVigente(undefined)).toBe(false);
  });
});

describe('ReaceptarAviso', () => {
  it('no deja continuar hasta marcar la casilla', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<ReaceptarAviso />);

    const continuar = screen.getByRole('button', { name: 'Aceptar y continuar' });
    expect(continuar).toBeDisabled();

    await usuario.click(screen.getByRole('checkbox'));
    expect(continuar).toBeEnabled();
  });

  it('al aceptar guarda las versiones vigentes del aviso y de los términos y la fecha en la cuenta, como en el registro', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<ReaceptarAviso />);

    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser).toHaveBeenCalledWith({
      data: { aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD, terminos_version: VERSION_TERMINOS, aviso_privacidad_aceptado_en: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
    });
  });

  it('si no se pudo guardar, lo muestra y deja reintentar', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Network error' } });
    const usuario = userEvent.setup();
    renderConProveedores(<ReaceptarAviso />);

    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));

    expect(await screen.findByText('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar y continuar' })).toBeEnabled();
  });

  it('quien no quiere aceptar puede cerrar sesión', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<ReaceptarAviso />);

    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(signOut).toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('enlaza al aviso y a los términos completos, cada uno en otra pestaña', () => {
    renderConProveedores(<ReaceptarAviso />);

    const aviso = screen.getByRole('link', { name: 'Aviso de privacidad' });
    expect(aviso).toHaveAttribute('href', '/privacidad');
    expect(aviso).toHaveAttribute('target', '_blank');
    const terminos = screen.getByRole('link', { name: 'Términos y condiciones' });
    expect(terminos).toHaveAttribute('href', '/terminos');
    expect(terminos).toHaveAttribute('target', '_blank');
  });
});
