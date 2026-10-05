import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { FilaMeta } from '@/components/FilaMeta';
import { ApiError } from '@/lib/api';
import type { MovimientoMeta } from '@/hooks/use-movimientos-meta';
import { pesos, renderConProveedores } from '@/test/utilidades';

const meta = {
  id: 'm1',
  nombre: 'Quintana',
  montoObjetivo: pesos(2000000), // $20,000.00
  montoAcumulado: pesos(230614), // $2,306.14
  porcentajeAvance: 11.5,
};

const DISPONIBLE = pesos(570000); // $5,700.00

let movimientos: MovimientoMeta[] = [];

/** Llamadas de escritura (POST/PATCH/DELETE) que la pantalla hizo al servidor. */
function escrituras() {
  return apiFetch.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET').map(([ruta, init]) => ({ ruta: ruta as string, metodo: init.method as string, cuerpo: init.body ? JSON.parse(init.body) : undefined }));
}

beforeEach(() => {
  movimientos = [];
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
    if (ruta === '/periodos/activo/disponible') return { estado: 'ok', periodoId: 'p1', disponible: DISPONIBLE, diasRestantes: 12, cifraDiaria: pesos(47500), gastadoHoy: pesos(0), huboActividadHoy: false, calculadoEn: 'x' };
    if (ruta === '/metas/m1/movimientos') return movimientos;
    if (init?.method === 'DELETE') return undefined;
    return {};
  });
});

function montar() {
  const usuario = userEvent.setup();
  renderConProveedores(<ul><FilaMeta meta={meta} /></ul>);
  return usuario;
}

async function esperarDisponible() {
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/periodos/activo/disponible'));
}

describe('FilaMeta — vista inicial', () => {
  it('muestra el nombre, lo ahorrado, el objetivo y el avance', () => {
    montar();

    expect(screen.getByText('Quintana')).toBeInTheDocument();
    expect(screen.getByText('$2,306.14 de $20,000.00')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('tiene dos botones principales; Editar y Eliminar van al pie, no entre los botones grandes', () => {
    montar();

    expect(screen.getByRole('button', { name: /Agregar dinero/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar dinero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar con la meta/ })).not.toBeInTheDocument();
  });

  it('no pide el historial hasta que se abre "Ver movimientos"', async () => {
    const usuario = montar();
    await esperarDisponible();
    expect(apiFetch).not.toHaveBeenCalledWith('/metas/m1/movimientos');

    await usuario.click(screen.getByRole('button', { name: /Ver movimientos/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/metas/m1/movimientos'));
  });
});

describe('FilaMeta — Agregar dinero', () => {
  it('por defecto es "De mi quincena" y dice cuánto hay disponible', async () => {
    const usuario = montar();
    await esperarDisponible();

    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));

    expect(screen.getByRole('radio', { name: 'De mi quincena' })).toBeChecked();
    expect(await screen.findByText(/Tienes \$5,700\.00 disponible/)).toBeInTheDocument();
  });

  it('no deja aportar más de lo disponible: avisa cuánto hay y no llama al servidor', async () => {
    const usuario = montar();
    await esperarDisponible();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));
    await screen.findByText(/Tienes \$5,700\.00 disponible/);

    await usuario.type(screen.getByPlaceholderText('Monto'), '6000');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    expect(screen.getByText('Tu quincena solo tiene $5,700.00 disponible')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });

  it('un aporte válido va a /aportes en centavos y cierra el formulario', async () => {
    const usuario = montar();
    await esperarDisponible();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));
    await screen.findByText(/Tienes \$5,700\.00 disponible/);

    await usuario.type(screen.getByPlaceholderText('Monto'), '123.45');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/aportes', metodo: 'POST', cuerpo: { monto: pesos(12345) } }]));
    expect(await screen.findByRole('button', { name: /Agregar dinero/ })).toBeInTheDocument();
  });

  it('aportar exactamente todo lo disponible se permite', async () => {
    const usuario = montar();
    await esperarDisponible();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));
    await screen.findByText(/Tienes \$5,700\.00 disponible/);

    await usuario.type(screen.getByPlaceholderText('Monto'), '5700');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    await waitFor(() => expect(escrituras()).toHaveLength(1));
  });

  it('un monto vacío, cero o negativo se rechaza con un mensaje', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));

    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));
    expect(screen.getByText('El monto debe ser mayor a cero')).toBeInTheDocument();

    await usuario.type(screen.getByPlaceholderText('Monto'), '-5');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));
    expect(screen.getByText('El monto debe ser mayor a cero')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });

  it('"Ya lo tenía ahorrado" es un aporte externo: va a /depositos, sin tope de disponible, con origen opcional', async () => {
    const usuario = montar();
    await esperarDisponible();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));
    await usuario.click(screen.getByRole('radio', { name: 'Ya lo tenía ahorrado' }));

    expect(screen.getByText(/Es dinero que ya tenías fuera de Korly/)).toBeInTheDocument();
    await usuario.type(screen.getByPlaceholderText('Monto'), '50000'); // mucho más que el disponible de la quincena
    await usuario.type(screen.getByPlaceholderText('Origen (opcional)'), 'Ahorro que ya tenía');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/depositos', metodo: 'POST', cuerpo: { monto: pesos(5000000), motivo: 'Ahorro que ya tenía' } }]));
  });

  it('el aporte externo funciona sin origen', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));
    await usuario.click(screen.getByRole('radio', { name: 'Ya lo tenía ahorrado' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '100');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/depositos', metodo: 'POST', cuerpo: { monto: pesos(10000) } }]));
  });

  it('muestra el error del servidor si rechaza el aporte', async () => {
    apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
      if (ruta === '/periodos/activo/disponible') return { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' };
      if (init?.method === 'POST') throw new ApiError(409, 'SIN_PERIODO_ACTIVO', 'No hay periodo activo del cual descontar el aporte');
      return [];
    });
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '100');
    await usuario.click(screen.getByRole('button', { name: 'Aportar' }));

    expect(await screen.findByText('No hay periodo activo del cual descontar el aporte')).toBeInTheDocument();
  });

  it('Cancelar cierra el formulario sin llamar al servidor', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: /Agregar dinero/ }));

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: /Agregar dinero/ })).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });
});

describe('FilaMeta — Usar dinero', () => {
  it('por defecto es "Pagar algo" y dice cuánto tiene la meta', async () => {
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));

    expect(screen.getByRole('radio', { name: 'Pagar algo' })).toBeChecked();
    expect(screen.getByText(/La meta tiene \$2,306\.14/)).toBeInTheDocument();
  });

  it('pagar pide el motivo', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '100');
    await usuario.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(screen.getByText('Indica en qué usas este dinero')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });

  it('no deja pagar más de lo que tiene la meta', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '2306.15');
    await usuario.type(screen.getByPlaceholderText('¿En qué lo usas?'), 'Renta');
    await usuario.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(screen.getByText('La meta solo tiene $2,306.14')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });

  it('un pago válido va a /pagos con su motivo', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '1027.74');
    await usuario.type(screen.getByPlaceholderText('¿En qué lo usas?'), 'pago de tarjeta');
    await usuario.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/pagos', metodo: 'POST', cuerpo: { monto: pesos(102774), motivo: 'pago de tarjeta' } }]));
  });

  it('se puede pagar exactamente todo lo que tiene la meta', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '2306.14');
    await usuario.type(screen.getByPlaceholderText('¿En qué lo usas?'), 'Todo');
    await usuario.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => expect(escrituras()).toHaveLength(1));
  });

  it('cambiar a "Pasar a mi quincena" conserva el monto y manda a /retiros', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));
    await usuario.type(screen.getByPlaceholderText('Monto'), '500');

    await usuario.click(screen.getByRole('radio', { name: 'Pasar a mi quincena' }));

    expect(screen.getByPlaceholderText('Monto')).toHaveValue(500);
    expect(screen.getByText(/aumenta lo que puedes gastar/)).toBeInTheDocument();
    await usuario.type(screen.getByPlaceholderText('Motivo'), 'Emergencia');
    await usuario.click(screen.getByRole('button', { name: 'Pasar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/retiros', metodo: 'POST', cuerpo: { monto: pesos(50000), motivo: 'Emergencia' } }]));
  });

  it('pasar a la quincena más de lo que tiene la meta se rechaza', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Usar dinero' }));
    await usuario.click(screen.getByRole('radio', { name: 'Pasar a mi quincena' }));

    await usuario.type(screen.getByPlaceholderText('Monto'), '3000');
    await usuario.type(screen.getByPlaceholderText('Motivo'), 'Emergencia');
    await usuario.click(screen.getByRole('button', { name: 'Pasar' }));

    expect(screen.getByText('La meta solo tiene $2,306.14')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });
});

describe('FilaMeta — Editar', () => {
  it('abre con el nombre y el objetivo actuales', async () => {
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Quintana');
    expect(screen.getByLabelText('Objetivo')).toHaveValue(20000);
    expect(screen.getByText(/Lo que ya ahorraste no cambia/)).toBeInTheDocument();
  });

  it('un nombre vacío o un objetivo en cero se rechazan', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Editar' }));

    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('El nombre no puede estar vacío')).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Nombre'), 'Viaje');
    await usuario.clear(screen.getByLabelText('Objetivo'));
    await usuario.type(screen.getByLabelText('Objetivo'), '0');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('El objetivo debe ser mayor a cero')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);
  });

  it('guardar manda PATCH con el nombre recortado y el objetivo en centavos', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Editar' }));

    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.type(screen.getByLabelText('Nombre'), '  Viaje a Quintana ');
    await usuario.clear(screen.getByLabelText('Objetivo'));
    await usuario.type(screen.getByLabelText('Objetivo'), '30000.50');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1', metodo: 'PATCH', cuerpo: { nombre: 'Viaje a Quintana', montoObjetivo: pesos(3000050) } }]));
  });
});

describe('FilaMeta — Eliminar', () => {
  it('pide confirmación y solo entonces llama al servidor', async () => {
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByText('¿Eliminar la meta "Quintana"?')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);

    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1', metodo: 'DELETE', cuerpo: undefined }]));
  });

  it('cancelar la confirmación no elimina nada', async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(escrituras()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('si la meta todavía tiene saldo, muestra el mensaje del servidor que dice cómo dejarla en cero', async () => {
    apiFetch.mockImplementation(async (ruta: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw new ApiError(409, 'META_CON_HISTORIAL', 'Esta meta todavía tiene saldo. Déjala en cero (paga con ella o pásalo a tu quincena) y después podrás eliminarla.');
      if (ruta === '/periodos/activo/disponible') return { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' };
      return [];
    });
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    expect(await screen.findByText(/Déjala en cero/)).toBeInTheDocument();
  });
});

describe('FilaMeta — historial', () => {
  const base = { fechaEfectiva: '2026-10-01', revertido: false };

  it('muestra cada movimiento con su etiqueta y su signo', async () => {
    movimientos = [
      { ...base, id: 'a', tipo: 'deposito', monto: pesos(500000), nota: 'Ahorro que ya tenía' },
      { ...base, id: 'b', tipo: 'pago', monto: pesos(-102774), nota: 'Renta' },
      { ...base, id: 'c', tipo: 'retiro', monto: pesos(-10000), nota: 'Emergencia' },
      { ...base, id: 'd', tipo: 'aporte', monto: pesos(333388), nota: null },
    ];
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: /Ver movimientos/ }));

    expect(await screen.findByText('Aporte externo: Ahorro que ya tenía')).toBeInTheDocument();
    expect(screen.getByText('Pago: Renta')).toBeInTheDocument();
    expect(screen.getByText('A la quincena: Emergencia')).toBeInTheDocument();
    expect(screen.getByText('Aporte')).toBeInTheDocument();
    expect(screen.getByText('+$5,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$1,027.74')).toBeInTheDocument();
    expect(screen.getByText('+$3,333.88')).toBeInTheDocument();
  });

  it('solo los pagos y los aportes externos se pueden deshacer, y se avisa que ya están deshechos', async () => {
    movimientos = [
      { ...base, id: 'a', tipo: 'deposito', monto: pesos(500000), nota: null },
      { ...base, id: 'b', tipo: 'pago', monto: pesos(-100), nota: 'x' },
      { ...base, id: 'c', tipo: 'retiro', monto: pesos(-100), nota: 'y' },
      { ...base, id: 'd', tipo: 'pago', monto: pesos(-200), nota: 'z', revertido: true },
    ];
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: /Ver movimientos/ }));
    await screen.findByText('Pago: x');

    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(2); // el aporte externo y el primer pago
    expect(screen.getByText(/deshecho/)).toBeInTheDocument();
  });

  it('deshacer un pago pide confirmación y llama a /pagos/:id; un aporte externo, a /depositos/:id', async () => {
    movimientos = [
      { ...base, id: 'dep-1', tipo: 'deposito', monto: pesos(500000), nota: null },
      { ...base, id: 'pag-1', tipo: 'pago', monto: pesos(-100), nota: 'x' },
    ];
    const usuario = montar();
    await usuario.click(screen.getByRole('button', { name: /Ver movimientos/ }));
    await screen.findByText('Pago: x');

    const filaPago = screen.getByText('Pago: x').closest('div')!.parentElement!;
    await usuario.click(within(filaPago).getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByText('¿Deshacer este pago? El dinero vuelve a la meta.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));
    await waitFor(() => expect(escrituras()).toEqual([{ ruta: '/metas/m1/pagos/pag-1', metodo: 'DELETE', cuerpo: undefined }]));

    const filaDeposito = screen.getByText('Aporte externo').closest('div')!.parentElement!;
    await usuario.click(within(filaDeposito).getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByText('¿Deshacer este aporte? El dinero sale de la meta.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));
    await waitFor(() => expect(escrituras().at(-1)).toEqual({ ruta: '/metas/m1/depositos/dep-1', metodo: 'DELETE', cuerpo: undefined }));
  });
});
