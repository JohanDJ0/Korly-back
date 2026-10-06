import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { TarjetaPlan } from '@/components/TarjetaPlan';
import { useSuscripcion, type Suscripcion } from '@/hooks/use-suscripcion';
import { ApiError } from '@/lib/api';
import { renderConProveedores } from '@/test/utilidades';

const gratisProximamente: Suscripcion = { plan: 'free', estadoSuscripcion: null, suscripcionVigenteHasta: null, cobrosHabilitados: false, avisoProSolicitadoEn: null };

/** Lo que la pantalla de verdad hace: leer la suscripción del servidor, que cambia cuando se pide o se cancela el aviso. */
function PlanConServidor() {
  const { data } = useSuscripcion();
  return data ? <TarjetaPlan suscripcion={data} /> : null;
}

let servidor: Suscripcion;

beforeEach(() => {
  servidor = { ...gratisProximamente };
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
    if (ruta === '/suscripcion') return servidor;
    if (ruta === '/suscripcion/aviso-pro' && init?.method === 'POST') {
      servidor = { ...servidor, avisoProSolicitadoEn: '2026-10-05T12:00:00.000Z' };
      return { avisoProSolicitadoEn: servidor.avisoProSolicitadoEn };
    }
    if (ruta === '/suscripcion/aviso-pro' && init?.method === 'DELETE') {
      servidor = { ...servidor, avisoProSolicitadoEn: null };
      return undefined;
    }
    throw new Error(`petición inesperada: ${init?.method ?? 'GET'} ${ruta}`);
  });
});

describe('TarjetaPlan — Korly Pro "próximamente" (cobros apagados)', () => {
  it('no muestra botones de pago ni precios: explica qué traerá Pro', () => {
    renderConProveedores(<TarjetaPlan suscripcion={gratisProximamente} />);

    expect(screen.getByText('Plan gratuito')).toBeInTheDocument();
    expect(screen.getByText('Korly Pro llegará pronto')).toBeInTheDocument();
    for (const ventaja of ['Presupuesto en pareja o familia', 'Metas en común', 'Alertas de ritmo', 'Metas sin límite', 'Historial completo', 'Exportar a CSV']) {
      expect(screen.getByText(ventaja)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /\$89/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\$790/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });

  it('"Avísame" guarda la petición, la pantalla confirma y ofrece retirarla', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<PlanConServidor />);

    await usuario.click(await screen.findByRole('button', { name: 'Avísame cuando esté disponible' }));

    expect(await screen.findByText(/te avisaremos por correo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avísame cuando esté disponible' })).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/suscripcion/aviso-pro', { method: 'POST' });
  });

  it('"Ya no me avises" retira la petición y vuelve el botón', async () => {
    servidor = { ...servidor, avisoProSolicitadoEn: '2026-10-05T12:00:00.000Z' };
    const usuario = userEvent.setup();
    renderConProveedores(<PlanConServidor />);

    await usuario.click(await screen.findByRole('button', { name: 'Ya no me avises' }));

    expect(await screen.findByRole('button', { name: 'Avísame cuando esté disponible' })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/suscripcion/aviso-pro', { method: 'DELETE' });
  });

  it('si el servidor falla al guardar, lo dice y deja volver a intentar', async () => {
    apiFetch.mockImplementation(async (ruta: string) => {
      if (ruta === '/suscripcion') return servidor;
      throw new ApiError(500, 'ERROR_INTERNO', 'Error interno del servidor');
    });
    const usuario = userEvent.setup();
    renderConProveedores(<PlanConServidor />);

    await usuario.click(await screen.findByRole('button', { name: 'Avísame cuando esté disponible' }));

    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Avísame cuando esté disponible' })).toBeEnabled());
  });
});

describe('TarjetaPlan — cobros habilitados (cuando Pro ya se venda)', () => {
  it('un usuario gratuito ve los dos botones de Stripe y no el "Avísame"', () => {
    renderConProveedores(<TarjetaPlan suscripcion={{ ...gratisProximamente, cobrosHabilitados: true }} />);

    expect(screen.getByRole('button', { name: 'Pro — $89/mes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pro — $790/año' })).toBeInTheDocument();
    expect(screen.queryByText('Korly Pro llegará pronto')).not.toBeInTheDocument();
  });

  it('un usuario Pro con cobros habilitados ve "Gestionar suscripción"', () => {
    renderConProveedores(
      <TarjetaPlan suscripcion={{ plan: 'pro', estadoSuscripcion: 'activa', suscripcionVigenteHasta: '2026-11-05T00:00:00.000Z', cobrosHabilitados: true, avisoProSolicitadoEn: null }} />
    );

    expect(screen.getByText('Korly Pro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gestionar suscripción' })).toBeInTheDocument();
  });

  it('un usuario Pro con los cobros apagados no ve "Gestionar suscripción" (el portal respondería 403) ni el "Avísame"', () => {
    renderConProveedores(
      <TarjetaPlan suscripcion={{ plan: 'pro', estadoSuscripcion: 'activa', suscripcionVigenteHasta: '2026-11-05T00:00:00.000Z', cobrosHabilitados: false, avisoProSolicitadoEn: null }} />
    );

    expect(screen.getByText('Korly Pro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gestionar suscripción' })).not.toBeInTheDocument();
    expect(screen.queryByText('Korly Pro llegará pronto')).not.toBeInTheDocument();
  });
});
