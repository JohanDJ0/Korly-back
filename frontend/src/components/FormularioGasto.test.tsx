import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { FormularioGasto } from '@/components/FormularioGasto';
import { hoyISO } from '@/lib/fechas';
import { pesos, renderConProveedores } from '@/test/utilidades';

type Disponible = { estado: 'ok'; disponible: ReturnType<typeof pesos> } | { estado: 'sin_ingreso' };

let disponible: Disponible;

function gastosRegistrados() {
  return apiFetch.mock.calls.filter(([ruta, init]) => ruta === '/periodos/p1/gastos' && init?.method === 'POST').map(([, init]) => JSON.parse(init.body));
}

beforeEach(() => {
  disponible = { estado: 'ok', disponible: pesos(570000) }; // $5,700.00
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
    if (ruta === '/periodos/activo/disponible') {
      return disponible.estado === 'ok'
        ? { estado: 'ok', periodoId: 'p1', disponible: disponible.disponible, diasRestantes: 12, cifraDiaria: pesos(47500), gastadoHoy: pesos(0), huboActividadHoy: false, calculadoEn: 'x' }
        : { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' };
    }
    if (ruta === '/categorias') return [];
    if (init?.method === 'POST') return { id: 'g1', movimientoId: 'm1', periodoId: 'p1' };
    return {};
  });
});

async function montar() {
  const usuario = userEvent.setup();
  const onRegistrado = vi.fn();
  renderConProveedores(<FormularioGasto periodoId="p1" onRegistrado={onRegistrado} />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/periodos/activo/disponible'));
  // El formulario ya tiene que conocer el disponible antes de que el usuario pulse Registrar.
  await new Promise((resolver) => setTimeout(resolver, 20));
  return { usuario, onRegistrado, monto: () => screen.getByLabelText('¿Cuánto gastaste?') };
}

describe('FormularioGasto — un gasto que alcanza se registra con un solo toque', () => {
  it('manda el monto en centavos con la fecha de hoy y avisa que ya se registró', async () => {
    const { usuario, onRegistrado, monto } = await montar();

    await usuario.type(monto(), '100');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    await waitFor(() => expect(gastosRegistrados()).toHaveLength(1));
    expect(gastosRegistrados()[0]).toMatchObject({ monto: pesos(10000), fechaEfectiva: hoyISO() });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
  });

  it('gastar exactamente todo lo disponible no pide confirmación', async () => {
    const { usuario, monto } = await montar();

    await usuario.type(monto(), '5700');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    await waitFor(() => expect(gastosRegistrados()).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un monto en cero se rechaza con un mensaje y no llama al servidor', async () => {
    const { usuario, monto } = await montar();

    await usuario.type(monto(), '0');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    expect(await screen.findByText('El monto debe ser mayor a cero')).toBeInTheDocument();
    expect(gastosRegistrados()).toEqual([]);
  });
});

describe('FormularioGasto — un gasto mayor al disponible pide confirmación', () => {
  it('avisa cuánto quedaría la quincena en negativo y NO registra todavía', async () => {
    const { usuario, monto } = await montar();

    await usuario.type(monto(), '6000');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Este gasto es mayor a lo que tienes disponible');
    expect(aviso).toHaveTextContent('Tienes $5,700.00 y este gasto es de $6,000.00');
    expect(aviso).toHaveTextContent('-$300.00');
    expect(gastosRegistrados()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Registrar de todos modos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corregir el monto' })).toBeInTheDocument();
  });

  it('"Registrar de todos modos" registra exactamente una vez', async () => {
    const { usuario, onRegistrado, monto } = await montar();
    await usuario.type(monto(), '6000');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    await usuario.click(await screen.findByRole('button', { name: 'Registrar de todos modos' }));

    await waitFor(() => expect(gastosRegistrados()).toHaveLength(1));
    expect(gastosRegistrados()[0]).toMatchObject({ monto: pesos(600000) });
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
  });

  it('"Corregir el monto" quita el aviso y vuelve el botón normal, sin registrar', async () => {
    const { usuario, monto } = await montar();
    await usuario.type(monto(), '6000');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    await usuario.click(await screen.findByRole('button', { name: 'Corregir el monto' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar/ })).toBeInTheDocument();
    expect(gastosRegistrados()).toEqual([]);
  });

  it('si el usuario cambia el monto con el aviso abierto, el aviso desaparece solo', async () => {
    const { usuario, monto } = await montar();
    await usuario.type(monto(), '6000');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));
    await screen.findByRole('alert');

    await usuario.clear(monto());
    await usuario.type(monto(), '5000');

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));
    await waitFor(() => expect(gastosRegistrados()).toHaveLength(1));
  });

  it('con la quincena ya en negativo, cualquier gasto pide confirmación y dice cuánto quedaría', async () => {
    disponible = { estado: 'ok', disponible: pesos(-5000) }; // -$50.00
    const { usuario, monto } = await montar();

    await usuario.type(monto(), '10');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('-$60.00'); // -50 - 10
    expect(gastosRegistrados()).toEqual([]);
  });

  it('sin ingreso registrado no se conoce el disponible: no se pide confirmación', async () => {
    disponible = { estado: 'sin_ingreso' };
    const { usuario, monto } = await montar();

    await usuario.type(monto(), '999999');
    await usuario.click(screen.getByRole('button', { name: /Registrar/ }));

    await waitFor(() => expect(gastosRegistrados()).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
