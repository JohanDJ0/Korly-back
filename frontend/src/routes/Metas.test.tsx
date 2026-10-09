import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { Meta } from '@/hooks/use-metas';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Metas } from '@/routes/Metas';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const vacaciones: Meta = { id: 'm1', nombre: 'Vacaciones', montoObjetivo: pesos(1000000), montoAcumulado: pesos(250000), porcentajeAvance: 25 };
const laptop: Meta = { id: 'm2', nombre: 'Laptop', montoObjetivo: pesos(2000000), montoAcumulado: pesos(2400000), porcentajeAvance: 120 };

function rutas(extra: Rutas = {}): Rutas {
  // FilaMeta pregunta cuánto hay disponible para topar los aportes de la quincena.
  return { '/metas': [vacaciones, laptop], '/periodos/activo/disponible': { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' }, ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

/** Hay dos botones "Nueva meta" (encabezado de escritorio y pie de móvil); la pantalla decide cuál se ve con CSS. */
const botonesNuevaMeta = () => screen.getAllByRole('button', { name: /Nueva meta/ });

describe('Metas — la lista', () => {
  it('muestra cada meta con lo acumulado, el objetivo y el porcentaje de avance', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Metas />);

    expect(await screen.findByText('Vacaciones')).toBeInTheDocument();
    expect(screen.getByText(`${m(250000)} de ${m(1000000)}`)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText(`${m(2400000)} de ${m(2000000)}`)).toBeInTheDocument();
  });

  it('si se aportó más del objetivo, el porcentaje dice la verdad (120%) pero la barra no se sale de su caja', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/metas': [laptop] }));
    const { container } = renderConProveedores(<Metas />);

    expect(await screen.findByText('120%')).toBeInTheDocument();
    const barra = container.querySelector('[style*="width"]') as HTMLElement;
    expect(barra.style.width).toBe('100%');
  });

  it('sin metas lo dice y sigue ofreciendo crear una', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/metas': [] }));
    renderConProveedores(<Metas />);

    expect(await screen.findByText('Todavía no tienes ninguna meta.')).toBeInTheDocument();
    expect(botonesNuevaMeta().length).toBeGreaterThan(0);
  });

  it('un error del servidor se muestra, no una pantalla vacía', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/metas': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus metas'); } }));
    renderConProveedores(<Metas />);

    expect(await screen.findByText('No se pudieron leer tus metas')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no tienes ninguna meta.')).not.toBeInTheDocument();
  });

  it('el ojito enmascara lo acumulado y el objetivo de cada meta', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Metas />);
    await screen.findByText('Vacaciones');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));

    expect(screen.queryByText(`${m(250000)} de ${m(1000000)}`)).not.toBeInTheDocument();
    expect(screen.getAllByText('$ •••• de $ ••••')).toHaveLength(2); // una por meta
  });
});

describe('Metas — crear una meta', () => {
  async function abrirFormulario() {
    const usuario = userEvent.setup();
    renderConProveedores(<Metas />);
    await screen.findByText('Vacaciones');
    await usuario.click(botonesNuevaMeta()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nueva meta' });
    return { usuario, hoja };
  }

  it('"Cancelar" cierra la hoja sin mandar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.click(within(hoja).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(servidor.llamadasA('POST', '/metas')).toHaveLength(0);
  });

  it('valida: sin nombre y con el objetivo en cero no se manda', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Objetivo'), '0');
    await usuario.click(within(hoja).getByRole('button', { name: 'Crear meta' }));

    expect(await within(hoja).findByText('Ponle un nombre a tu meta')).toBeInTheDocument();
    expect(within(hoja).getByText('El objetivo debe ser mayor a cero')).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/metas')).toHaveLength(0);
  });

  it('crea la meta con el objetivo en centavos, cierra la hoja y vuelve a leer la lista', async () => {
    let metas = [vacaciones];
    servidor = instalarServidorFalso(apiFetch, rutas({ '/metas': () => metas, 'POST /metas': () => { metas = [vacaciones, laptop]; return laptop; } }));
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('¿Para qué estás ahorrando?'), '  Laptop  ');
    await usuario.type(within(hoja).getByLabelText('Objetivo'), '20000.75');
    await usuario.click(within(hoja).getByRole('button', { name: 'Crear meta' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/metas')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/metas')[0]?.cuerpo).toEqual({ nombre: 'Laptop', montoObjetivo: { valorMinimo: 2000075, moneda: 'MXN' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Laptop')).toBeInTheDocument(); // la lista se refrescó con la nueva
  });

  it('si el servidor rechaza la meta, la hoja sigue abierta y dice por qué', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /metas': () => { throw new ApiError(403, 'LIMITE_METAS_ALCANZADO', 'Llegaste al límite de metas del plan gratuito'); } }));
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('¿Para qué estás ahorrando?'), 'Moto');
    await usuario.type(within(hoja).getByLabelText('Objetivo'), '50000');
    await usuario.click(within(hoja).getByRole('button', { name: 'Crear meta' }));

    expect(await within(hoja).findByText('Llegaste al límite de metas del plan gratuito')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nueva meta' })).toBeInTheDocument();
  });
});
