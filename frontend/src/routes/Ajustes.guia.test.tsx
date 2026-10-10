import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, updateUser } = vi.hoisted(() => ({ apiFetch: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'yo@correo.com' } } }),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      updateUser,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { Ajustes } from '@/routes/Ajustes';
import { useAuthStore } from '@/stores/auth-store';
import { useGuiaStore } from '@/stores/guia-store';
import { instalarServidorFalso } from '@/test/servidor-falso';
import { renderEnRuta } from '@/test/utilidades';

const rutas = {
  '/preferencias': { recibirRecordatorios: true },
  '/suscripcion': { plan: 'free', estadoSuscripcion: null, suscripcionVigenteHasta: null, cobrosHabilitados: false, avisoProSolicitadoEn: null },
  '/periodos/activo': { id: 'p1', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' },
};

function montar() {
  // La ruta "*" de renderEnRuta hace de Inicio: ahí se comprueba a dónde se fue.
  return renderEnRuta(<Ajustes />, { path: '/ajustes', entrada: '/ajustes' });
}

beforeEach(() => {
  localStorage.clear();
  updateUser.mockReset().mockResolvedValue({ error: null });
  useGuiaStore.setState({ vistos: {}, terminadas: {} });
  // Una cuenta vieja que ya terminó la guía.
  useAuthStore.setState({ session: { user: { id: 'u1', email: 'yo@correo.com', created_at: '2026-09-01T00:00:00Z', user_metadata: { guia_terminada: true } } } as never, cargando: false });
});

describe('Ajustes — "Ver la guía otra vez"', () => {
  it('enciende la guía en la cuenta, olvida lo ya visto y lleva a Inicio', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] }, terminadas: { u1: true } });
    localStorage.setItem('korly:guia:u1', JSON.stringify(['cifra', 'registrar-gasto']));
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Ver la guía otra vez' }));

    expect(updateUser).toHaveBeenCalledWith({ data: { guia_terminada: false } });
    expect(await screen.findByTestId('otra-ruta')).toBeInTheDocument();
    expect(localStorage.getItem('korly:guia:u1')).toBeNull();
    expect(useGuiaStore.getState().vistos['u1']).toEqual([]);
    expect(useGuiaStore.getState().terminadas['u1']).toBeUndefined();
  });

  it('si no se pudo guardar, lo dice y no saca de Ajustes', async () => {
    updateUser.mockRejectedValue(new Error('sin red'));
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Ver la guía otra vez' }));

    expect(await screen.findByText('No pudimos reiniciar la guía. Inténtalo de nuevo.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('otra-ruta')).not.toBeInTheDocument());
  });
});
