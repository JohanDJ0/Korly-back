import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, updateUser } = vi.hoisted(() => ({ apiFetch: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser, getSession: vi.fn().mockResolvedValue({ data: { session: null } }), onAuthStateChange: vi.fn() } },
}));

import { FormularioGasto } from '@/components/FormularioGasto';
import { TEXTOS_GUIA } from '@/lib/guia';
import { useAuthStore } from '@/stores/auth-store';
import { useGuiaStore } from '@/stores/guia-store';
import { instalarServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const rutas = {
  '/periodos/activo/disponible': { estado: 'ok', periodoId: 'p1', disponible: pesos(570000), diasRestantes: 12, cifraDiaria: pesos(47500), gastadoHoy: pesos(0), huboActividadHoy: false, calculadoEn: 'x' },
  '/categorias': [],
};

beforeEach(() => {
  localStorage.clear();
  updateUser.mockReset().mockResolvedValue({ error: null });
  useGuiaStore.setState({ vistos: {}, terminadas: {} });
  useAuthStore.setState({ session: { user: { id: 'u1', created_at: new Date().toISOString(), user_metadata: {} } } as never, cargando: false });
});

describe('FormularioGasto — pista de la guía sobre los atajos', () => {
  it('con la guía en curso y el paso de "Registrar gasto" leído, aparece al escribir un monto', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);

    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument(); // sin monto todavía
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');

    expect(await screen.findByText(TEXTOS_GUIA['atajo-formulario'].texto)).toBeInTheDocument();
  });

  it('si se cierra el formulario sin hacer nada, la pista vuelve la próxima vez (no se perdió)', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    const primera = renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await screen.findByText(TEXTOS_GUIA['atajo-formulario'].texto);
    primera.unmount();

    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');

    expect(await screen.findByText(TEXTOS_GUIA['atajo-formulario'].texto)).toBeInTheDocument();
  });

  it('al registrar el gasto la pista se da por leída: la siguiente vez ya no sale', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, { ...rutas, 'POST /periodos/p1/gastos': { id: 'g1', movimientoId: 'm1', periodoId: 'p1' } });
    const usuario = userEvent.setup();
    const primera = renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await usuario.click(await screen.findByRole('button', { name: /^Registrar/ }));
    await waitFor(() => expect(useGuiaStore.getState().vistos['u1']).toContain('atajo-formulario'));
    primera.unmount();

    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');

    await screen.findByRole('button', { name: 'Guardar como atajo' });
    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument();
  });

  it('al guardar el atajo la pista se da por leída', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, { ...rutas, 'POST /atajos-gasto': { id: 'a1', nombre: 'Café', monto: pesos(5500), categoriaId: null } });
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await usuario.click(await screen.findByRole('button', { name: 'Guardar como atajo' }));
    await usuario.type(screen.getByLabelText('Nombre del atajo'), 'Café');
    await usuario.click(screen.getByRole('button', { name: 'Guardar atajo' }));

    await waitFor(() => expect(useGuiaStore.getState().vistos['u1']).toContain('atajo-formulario'));
    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument();
  });

  it('"Entendido" la quita al instante', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');

    await usuario.click(await screen.findByRole('button', { name: 'Entendido' }));

    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar como atajo' })).toBeInTheDocument();
  });

  it('no sale si todavía no leyó el paso de "Registrar gasto", ni si la guía está apagada', async () => {
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    const { unmount } = renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await screen.findByRole('button', { name: 'Guardar como atajo' });
    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument();
    unmount();

    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    useAuthStore.setState({ session: { user: { id: 'u1', created_at: new Date().toISOString(), user_metadata: { guia_terminada: true } } } as never });
    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await screen.findByRole('button', { name: 'Guardar como atajo' });
    expect(screen.queryByText(TEXTOS_GUIA['atajo-formulario'].texto)).not.toBeInTheDocument();
  });

  it('"Saltar guía" la apaga en la cuenta', async () => {
    useGuiaStore.setState({ vistos: { u1: ['cifra', 'registrar-gasto'] } });
    instalarServidorFalso(apiFetch, rutas);
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');

    await usuario.click(await screen.findByRole('button', { name: 'Saltar guía' }));

    expect(updateUser).toHaveBeenCalledWith({ data: { guia_terminada: true } });
  });
});
