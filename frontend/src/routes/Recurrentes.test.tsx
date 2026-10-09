import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { GastoRecurrente } from '@/hooks/use-recurrentes';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Recurrentes } from '@/routes/Recurrentes';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const netflix: GastoRecurrente = { id: 'r1', descripcion: 'Netflix', monto: pesos(21900), categoriaId: null, frecuencia: 'mensual', diaMes: 15, activo: true };
const renta: GastoRecurrente = { id: 'r2', descripcion: 'Renta', monto: pesos(450000), categoriaId: null, frecuencia: 'quincenal', diaMes: null, activo: true };
const gym: GastoRecurrente = { id: 'r3', descripcion: 'Gimnasio', monto: pesos(80000), categoriaId: null, frecuencia: 'mensual', diaMes: 1, activo: false };

function rutas(extra: Rutas = {}): Rutas {
  return { '/gastos-recurrentes': [netflix, renta, gym], '/categorias': [{ id: 'c1', nombre: 'Suscripciones', esPredeterminada: false, icono: null }], ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

/** Hay dos botones "Nuevo gasto recurrente" (encabezado de escritorio y pie de móvil); la pantalla decide cuál se ve con CSS. */
const botonesNuevo = () => screen.getAllByRole('button', { name: /Nuevo gasto recurrente/ });

describe('Recurrentes — la lista', () => {
  it('explica que se aplican solos y muestra cada uno con su monto y su frecuencia', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Recurrentes />);

    expect(await screen.findByText('Se aplican solos cuando toca — no hace falta capturarlos a mano.')).toBeInTheDocument();
    expect(await screen.findByText(`${m(21900)} — Mensual, día 15`)).toBeInTheDocument();
    expect(screen.getByText(`${m(450000)} — Cada quincena`)).toBeInTheDocument();
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('Renta')).toBeInTheDocument();
  });

  it('los pausados se marcan "Pausado" y ofrecen reanudar; los activos ofrecen pausar', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Recurrentes />);

    expect(await screen.findByText(`${m(80000)} — Mensual, día 1 — Pausado`)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Pausar' })).toHaveLength(2); // Netflix y Renta
    expect(screen.getAllByRole('button', { name: 'Reanudar' })).toHaveLength(1); // Gimnasio
    expect(screen.queryByText(/Netflix.*Pausado/)).not.toBeInTheDocument();
  });

  it('sin recurrentes lo dice y sigue ofreciendo crear uno', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/gastos-recurrentes': [] }));
    renderConProveedores(<Recurrentes />);

    expect(await screen.findByText('Todavía no tienes ninguna suscripción o gasto recurrente registrado.')).toBeInTheDocument();
    expect(botonesNuevo().length).toBeGreaterThan(0);
  });

  it('un error del servidor se muestra, no una pantalla vacía', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/gastos-recurrentes': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus gastos recurrentes'); } }));
    renderConProveedores(<Recurrentes />);

    expect(await screen.findByText('No se pudieron leer tus gastos recurrentes')).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no tienes/)).not.toBeInTheDocument();
  });

  it('el ojito enmascara los montos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Recurrentes />);
    await screen.findByText('Netflix');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));

    expect(screen.queryByText(`${m(21900)} — Mensual, día 15`)).not.toBeInTheDocument();
    expect(screen.getByText('$ •••• — Mensual, día 15')).toBeInTheDocument();
  });
});

describe('Recurrentes — pausar y reanudar', () => {
  it('"Pausar" manda activo:false para ese recurrente y la lista se vuelve a leer', async () => {
    let lista = [netflix, renta, gym];
    servidor = instalarServidorFalso(apiFetch, rutas({ '/gastos-recurrentes': () => lista, 'PATCH /gastos-recurrentes/r1': () => { lista = [{ ...netflix, activo: false }, renta, gym]; return lista[0]; } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Recurrentes />);
    await screen.findByText('Netflix');

    await usuario.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!);

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/gastos-recurrentes/r1')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/gastos-recurrentes/r1')[0]?.cuerpo).toEqual({ activo: false });
    expect(await screen.findByText(`${m(21900)} — Mensual, día 15 — Pausado`)).toBeInTheDocument();
  });

  it('"Reanudar" manda activo:true', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'PATCH /gastos-recurrentes/r3': { ...gym, activo: true } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Recurrentes />);

    await usuario.click(await screen.findByRole('button', { name: 'Reanudar' }));

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/gastos-recurrentes/r3')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/gastos-recurrentes/r3')[0]?.cuerpo).toEqual({ activo: true });
  });

  it('si el servidor no lo permite, lo dice junto a ese recurrente', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'PATCH /gastos-recurrentes/r1': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudo pausar'); } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Recurrentes />);
    await screen.findByText('Netflix');

    await usuario.click(screen.getAllByRole('button', { name: 'Pausar' })[0]!);

    expect(await screen.findByText('No se pudo pausar')).toBeInTheDocument();
  });
});

describe('Recurrentes — crear uno', () => {
  async function abrirFormulario() {
    const usuario = userEvent.setup();
    renderConProveedores(<Recurrentes />);
    await screen.findByText('Netflix');
    await usuario.click(botonesNuevo()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo gasto recurrente' });
    return { usuario, hoja };
  }

  it('"Cancelar" cierra la hoja sin mandar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.click(within(hoja).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(0);
  });

  it('empieza en "Cada quincena" y el día del mes solo aparece al elegir "Una vez al mes"', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();
    expect(within(hoja).getByLabelText('Frecuencia')).toHaveValue('quincenal');
    expect(within(hoja).queryByLabelText('Día del mes en que se cobra')).not.toBeInTheDocument();

    await usuario.selectOptions(within(hoja).getByLabelText('Frecuencia'), 'mensual');
    expect(within(hoja).getByLabelText('Día del mes en que se cobra')).toBeInTheDocument();

    await usuario.selectOptions(within(hoja).getByLabelText('Frecuencia'), 'quincenal');
    expect(within(hoja).queryByLabelText('Día del mes en que se cobra')).not.toBeInTheDocument();
  });

  it('valida: sin descripción y con el monto en cero no se manda', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Monto'), '0');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText(/Ponle un nombre/)).toBeInTheDocument();
    expect(within(hoja).getByText('El monto debe ser mayor a cero')).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(0);
  });

  it('uno mensual exige el día del mes', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Descripción'), 'Spotify');
    await usuario.type(within(hoja).getByLabelText('Monto'), '129');
    await usuario.selectOptions(within(hoja).getByLabelText('Frecuencia'), 'mensual');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText(/Indica el día del mes en que se cobra/)).toBeInTheDocument();
    expect(within(hoja).queryByText(/Too small/)).not.toBeInTheDocument(); // mensaje de zod en inglés: no debe llegar a la pantalla
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(0);
  });

  it('un día del mes fuera de 1–31 tampoco se manda', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Descripción'), 'Spotify');
    await usuario.type(within(hoja).getByLabelText('Monto'), '129');
    await usuario.selectOptions(within(hoja).getByLabelText('Frecuencia'), 'mensual');
    await usuario.type(within(hoja).getByLabelText('Día del mes en que se cobra'), '32');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText(/Indica el día del mes en que se cobra/)).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(0);
  });

  it('uno quincenal se manda sin día del mes, con el monto en centavos, y cierra la hoja', async () => {
    let lista = [netflix];
    servidor = instalarServidorFalso(apiFetch, rutas({ '/gastos-recurrentes': () => lista, 'POST /gastos-recurrentes': () => { lista = [netflix, renta]; return renta; } }));
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Descripción'), '  Renta  ');
    await usuario.type(within(hoja).getByLabelText('Monto'), '4500.50');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')[0]?.cuerpo).toEqual({ descripcion: 'Renta', monto: { valorMinimo: 450050, moneda: 'MXN' }, frecuencia: 'quincenal' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Renta')).toBeInTheDocument(); // la lista se refrescó
  });

  it('uno mensual se manda con su día y con la categoría elegida', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /gastos-recurrentes': netflix }));
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Descripción'), 'Spotify');
    await usuario.type(within(hoja).getByLabelText('Monto'), '129');
    await usuario.selectOptions(within(hoja).getByLabelText('Frecuencia'), 'mensual');
    await usuario.type(within(hoja).getByLabelText('Día del mes en que se cobra'), '20');
    await usuario.selectOptions(await within(hoja).findByLabelText('Categoría'), 'c1');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/gastos-recurrentes')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/gastos-recurrentes')[0]?.cuerpo).toEqual({
      descripcion: 'Spotify',
      monto: { valorMinimo: 12900, moneda: 'MXN' },
      frecuencia: 'mensual',
      diaMes: 20,
      categoriaId: 'c1',
    });
  });

  it('si el servidor lo rechaza, la hoja sigue abierta y dice por qué', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /gastos-recurrentes': () => { throw new ApiError(403, 'FUNCION_PRO', 'Los gastos recurrentes ilimitados son de Korly Pro'); } }));
    const { usuario, hoja } = await abrirFormulario();

    await usuario.type(within(hoja).getByLabelText('Descripción'), 'Spotify');
    await usuario.type(within(hoja).getByLabelText('Monto'), '129');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText('Los gastos recurrentes ilimitados son de Korly Pro')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nuevo gasto recurrente' })).toBeInTheDocument();
  });
});
