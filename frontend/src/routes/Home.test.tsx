import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { Disponible } from '@/hooks/use-disponible';
import type { Desglose } from '@/hooks/use-desglose';
import type { Gasto } from '@/hooks/use-gastos';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Home } from '@/routes/Home';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores, renderEnRuta } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const sinPeriodo = () => {
  throw new ApiError(404, 'PERIODO_NO_ENCONTRADO', 'No hay un periodo activo');
};

const periodo = { id: 'p1', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' };

const disponibleOk = (cambios: Partial<Extract<Disponible, { estado: 'ok' }>> = {}): Disponible => ({
  estado: 'ok',
  periodoId: 'p1',
  disponible: pesos(455005), // $4,550.05
  diasRestantes: 12,
  cifraDiaria: pesos(37917), // $379.17 por día
  gastadoHoy: pesos(0),
  huboActividadHoy: false,
  calculadoEn: '2026-10-04T12:00:00Z',
  ...cambios,
});

const gasto = (id: string, centavos: number, extra: Partial<Gasto> = {}): Gasto => ({
  id,
  periodoId: 'p1',
  monto: pesos(centavos),
  fechaEfectiva: '2026-10-04',
  fechaRegistro: '2026-10-04T12:00:00Z',
  revertido: false,
  esRecurrente: false,
  ...extra,
});

const desgloseVacio: Desglose = {
  periodoId: 'p1',
  fechaInicio: '2026-10-01',
  fechaFin: '2026-10-15',
  totalGastado: pesos(0),
  totalVariable: pesos(0),
  recurrentes: { total: pesos(0), items: [] },
  rubros: [],
  semanas: [],
  semanaMasCara: null,
};

/** Lo que el servidor responde cuando todo está en orden y hay un periodo activo con su cifra. */
function rutasConPeriodo(extra: Rutas = {}): Rutas {
  return {
    '/periodos/activo/disponible': disponibleOk(),
    '/periodos/activo': periodo,
    '/resumenes/pendiente': null,
    '/periodos/p1/pagos-tarjeta': [],
    '/periodos/p1/gastos': { datos: [], siguienteCursor: null },
    '/periodos/p1/desglose': desgloseVacio,
    '/categorias': [],
    '/atajos-gasto': { atajos: [], limite: 3 },
    ...extra,
  };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

describe('Home — los tres estados de la primera cifra', () => {
  it('sin periodo activo: invita a empezar la quincena y no ofrece registrar nada todavía', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': sinPeriodo, '/periodos/activo': sinPeriodo }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('Empecemos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar esta quincena' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar gasto' })).not.toBeInTheDocument();
    expect(screen.queryByText('Puedes gastar hoy')).not.toBeInTheDocument();
  });

  it('"Empezar esta quincena" crea el periodo quincenal', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': sinPeriodo, '/periodos/activo': sinPeriodo, 'POST /periodos': periodo }));
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: 'Empezar esta quincena' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos')[0]?.cuerpo).toEqual({ tipo: 'quincenal' });
  });

  it('con periodo pero sin ingreso: pide el ingreso (no inventa un $0) y deja registrar gastos, no ingresos extra', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' } }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('Registra tu ingreso')).toBeInTheDocument();
    expect(screen.getByLabelText('¿Cuánto recibiste?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar gasto' })).toBeInTheDocument(); // la captura de gastos no se bloquea
    // El único "Registrar ingreso" que existe es el botón de enviar del formulario de arriba, no el atajo de abajo.
    const botonesIngreso = screen.getAllByRole('button', { name: 'Registrar ingreso' });
    expect(botonesIngreso).toHaveLength(1);
    expect(botonesIngreso[0]).toHaveAttribute('type', 'submit');
    expect(screen.queryByText('Puedes gastar hoy')).not.toBeInTheDocument();
  });

  it('con la cifra real: muestra cuánto puedes gastar hoy con los días restantes siempre al lado', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderConProveedores(<Home />);

    expect(await screen.findByText('Puedes gastar hoy')).toBeInTheDocument();
    expect(screen.getByText(m(37917), { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('por día, durante 12 días más')).toBeInTheDocument();
    expect(screen.getByText('Disponible total')).toBeInTheDocument();
    expect(screen.getByText(m(455005), { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(/^Quincena · /)).toBeInTheDocument();
  });

  it('un solo día restante se dice en singular', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': disponibleOk({ diasRestantes: 1 }) }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('por día, durante 1 día más')).toBeInTheDocument();
  });

  it('si ya te excediste hoy, lo dice en rojo como titular y no lo repite con el recordatorio', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': disponibleOk({ cifraDiaria: pesos(-5000), gastadoHoy: pesos(60000) }) }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('Te excediste hoy por')).toBeInTheDocument();
    expect(screen.getByText(m(5000), { selector: 'p' })).toBeInTheDocument(); // el exceso en positivo, sin signo
    expect(screen.queryByText(/hoy puedes gastar hasta/)).not.toBeInTheDocument();
  });

  it('si ya gastaste algo hoy, dice cuánto de tu objetivo de hoy llevas', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': disponibleOk({ gastadoHoy: pesos(10000), cifraDiaria: pesos(27917), huboActividadHoy: true }) }));
    renderConProveedores(<Home />);

    expect(await screen.findByText(`Ya gastaste ${m(10000)} de tu objetivo de hoy de ${m(37917)}`)).toBeInTheDocument();
  });

  it('un error inesperado del servidor se muestra tal cual, sin pantalla en blanco', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': () => { throw new ApiError(500, 'ERROR_INTERNO', 'El servidor no respondió'); } }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('El servidor no respondió')).toBeInTheDocument();
    expect(screen.queryByText('Empecemos')).not.toBeInTheDocument();
  });
});

describe('Home — recordatorio contextual', () => {
  it('sin actividad hoy trae la cifra accionable', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderConProveedores(<Home />);

    const aviso = await screen.findByText(/Te quedan 12 días con/);
    expect(aviso).toHaveTextContent(`Te quedan 12 días con ${m(455005)} disponible — hoy puedes gastar hasta ${m(37917)}.`);
  });

  it('se silencia solo cuando ya hubo actividad hoy', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': disponibleOk({ huboActividadHoy: true }) }));
    renderConProveedores(<Home />);

    await screen.findByText('Puedes gastar hoy');
    expect(screen.queryByText(/Te quedan/)).not.toBeInTheDocument();
  });
});

describe('Home — avisos', () => {
  it('un sobrante sin decidir de un periodo anterior se avisa con enlace para decidirlo', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({ '/resumenes/pendiente': { periodoId: 'anterior-9', totalIngresos: pesos(1), totalGastado: pesos(1), sobrante: pesos(123456), decisionSobrante: 'pendiente', generadoEn: 'x' } })
    );
    renderConProveedores(<Home />);

    const aviso = await screen.findByText(/sin decidir de un periodo anterior/);
    expect(aviso).toHaveTextContent(`Tienes ${m(123456)} sin decidir`);
    expect(screen.getByRole('link', { name: 'Decidir →' })).toHaveAttribute('href', '/resumen/anterior-9');
  });

  it('sin sobrante pendiente no hay aviso', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderConProveedores(<Home />);

    await screen.findByText('Puedes gastar hoy');
    expect(screen.queryByText(/sin decidir/)).not.toBeInTheDocument();
  });

  it('explica los pagos de tarjeta aplicados (el disponible baja por ellos aunque no sean "gastos")', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({
        '/periodos/p1/pagos-tarjeta': [
          { tarjetaNombre: 'BBVA', cargoDescripcion: 'Laptop', numeroPago: 2, numeroPlazos: 6, monto: pesos(150000) },
          { tarjetaNombre: 'Nu', cargoDescripcion: 'Teléfono', numeroPago: 1, numeroPlazos: 3, monto: pesos(80000) },
        ],
      })
    );
    renderConProveedores(<Home />);

    expect(await screen.findByText('2 pagos de tarjeta aplicados esta quincena')).toBeInTheDocument();
    expect(screen.getByText(`BBVA — Laptop (2/6): ${m(150000)}`)).toBeInTheDocument();
    expect(screen.getByText(`Nu — Teléfono (1/3): ${m(80000)}`)).toBeInTheDocument();
  });

  it('un solo pago de tarjeta se dice en singular', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/p1/pagos-tarjeta': [{ tarjetaNombre: 'BBVA', cargoDescripcion: 'Laptop', numeroPago: 2, numeroPlazos: 6, monto: pesos(150000) }] }));
    renderConProveedores(<Home />);

    expect(await screen.findByText('1 pago de tarjeta aplicado esta quincena')).toBeInTheDocument();
  });
});

describe('Home — actividad reciente y resumen compacto', () => {
  it('muestra solo los 3 últimos gastos vigentes (los corregidos no cuentan) y enlaza al historial', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({
        '/periodos/p1/gastos': {
          datos: [gasto('g1', 11100, { categoriaId: 'cat1' }), gasto('g2', 22200, { revertido: true }), gasto('g3', 33300, { esRecurrente: true }), gasto('g4', 44400), gasto('g5', 55500)],
          siguienteCursor: null,
        },
        '/categorias': [{ id: 'cat1', nombre: 'Comida', icono: null, esPredeterminada: true }],
      })
    );
    renderConProveedores(<Home />);

    expect(await screen.findByText('Actividad reciente')).toBeInTheDocument();
    expect(screen.getByText(`-${m(11100)}`)).toBeInTheDocument();
    expect(screen.getByText(`-${m(33300)}`)).toBeInTheDocument();
    expect(screen.getByText(`-${m(44400)}`)).toBeInTheDocument();
    expect(screen.queryByText(`-${m(22200)}`)).not.toBeInTheDocument(); // corregido
    expect(screen.queryByText(`-${m(55500)}`)).not.toBeInTheDocument(); // el cuarto vigente ya no cabe
    expect(await screen.findByText('Comida')).toBeInTheDocument();
    expect(screen.getByText(/automático/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todo' })).toHaveAttribute('href', '/historial');
  });

  it('sin gastos no hay bloque de actividad', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderConProveedores(<Home />);

    await screen.findByText('Puedes gastar hoy');
    expect(screen.queryByText('Actividad reciente')).not.toBeInTheDocument();
  });

  it('el resumen compacto muestra las 3 categorías principales, cuántas quedan fuera y enlaza al desglose completo', async () => {
    const rubro = (clave: string, etiqueta: string, centavos: number) => ({ clave, etiqueta, tipo: 'categoria' as const, monto: pesos(centavos) });
    const semana = (numero: number, total: number) => ({ numero, fechaInicio: '2026-10-01', fechaFin: '2026-10-07', dias: 7, diasTranscurridos: 7, total: pesos(total), promedioDiario: pesos(total / 7), rubros: [] });
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({
        '/periodos/p1/desglose': {
          ...desgloseVacio,
          totalGastado: pesos(100000),
          totalVariable: pesos(100000),
          rubros: [rubro('a', 'Comida', 50000), rubro('b', 'Transporte', 30000), rubro('c', 'Salud', 15000), rubro('d', 'Otros', 5000)],
          semanas: [semana(1, 60000), semana(2, 40000)],
          semanaMasCara: 1,
        } satisfies Desglose,
      })
    );
    renderConProveedores(<Home />);

    expect(await screen.findByText('EN QUÉ LLEVAS GASTADO')).toBeInTheDocument();
    expect(screen.getByText('Comida')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    expect(screen.getByText('Salud')).toBeInTheDocument();
    expect(screen.queryByText('Otros')).not.toBeInTheDocument();
    expect(screen.getByText('y 1 más')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver desglose →' })).toHaveAttribute('href', '/historial?desglose=1');
  });
});

describe('Home — registrar gastos e ingresos', () => {
  it('"Registrar gasto" abre la hoja del formulario y se puede cerrar', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: 'Registrar gasto' }));
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo gasto' });
    expect(within(hoja).getByRole('button', { name: /Registrar/ })).toBeInTheDocument();

    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Registrar ingreso" solo existe cuando ya hay cifra y abre su propia hoja', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: 'Registrar ingreso' }));

    expect(await screen.findByRole('dialog', { name: 'Nuevo ingreso' })).toBeInTheDocument();
  });
});

describe('Home — enlace del recordatorio (/?gasto=1)', () => {
  it('abre directo la hoja de "Nuevo gasto" y quita el parámetro: cerrarla no la reabre', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    const usuario = userEvent.setup();
    renderEnRuta(<Home />, { path: '/', entrada: '/?gasto=1' });

    expect(await screen.findByRole('dialog', { name: 'Nuevo gasto' })).toBeInTheDocument();

    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sin el parámetro, la hoja no se abre sola', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderEnRuta(<Home />, { path: '/', entrada: '/' });

    await screen.findByRole('button', { name: 'Registrar gasto' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sin periodo activo no hay dónde registrar: no abre nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/periodos/activo/disponible': sinPeriodo, '/periodos/activo': sinPeriodo }));
    renderEnRuta(<Home />, { path: '/', entrada: '/?gasto=1' });

    await screen.findByText('Empecemos');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Home — atajos de gasto', () => {
  const cafe = { id: 'a1', nombre: 'Café', monto: pesos(5500), categoriaId: 'c-comida' };
  const caro = { id: 'a2', nombre: 'Laptop', monto: pesos(600000), categoriaId: null }; // $6,000.00 > $4,550.05 disponibles

  it('sin atajos no se pinta nada (Inicio no se llena de cosas)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    renderConProveedores(<Home />);

    await screen.findByRole('button', { name: 'Registrar gasto' });
    expect(screen.queryByText('ATAJOS')).not.toBeInTheDocument();
  });

  it('un toque registra el gasto de hoy con el monto, la categoría y el nombre como nota, y avisa con "Deshacer"', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/atajos-gasto': { atajos: [cafe], limite: 3 }, 'POST /periodos/p1/gastos': { id: 'g9', movimientoId: 'm9', periodoId: 'p1' } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: `Café ${m(5500)}` }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos/p1/gastos')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos/p1/gastos')[0]?.cuerpo).toEqual({
      monto: { valorMinimo: 5500, moneda: 'MXN' },
      fechaEfectiva: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      categoriaId: 'c-comida',
      nota: 'Café',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(`Registrado: Café ${m(5500)}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // no abre ningún formulario
  });

  it('"Deshacer" borra el gasto recién registrado', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({ '/atajos-gasto': { atajos: [cafe], limite: 3 }, 'POST /periodos/p1/gastos': { id: 'g9', movimientoId: 'm9', periodoId: 'p1' }, 'DELETE /gastos/g9': undefined })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: `Café ${m(5500)}` }));
    await usuario.click(await screen.findByRole('button', { name: 'Deshacer' }));

    await waitFor(() => expect(servidor.llamadasA('DELETE', '/gastos/g9')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('un atajo mayor a lo disponible NO se registra solo: abre el formulario con el monto y el nombre puestos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/atajos-gasto': { atajos: [caro], limite: 3 } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: `Laptop ${m(600000)}` }));

    const hoja = await screen.findByRole('dialog', { name: 'Nuevo gasto' });
    expect(within(hoja).getByLabelText('¿Cuánto gastaste?')).toHaveValue(6000);
    expect(within(hoja).getByLabelText(/Nota/i)).toHaveValue('Laptop');
    expect(servidor.llamadasA('POST', '/periodos/p1/gastos')).toHaveLength(0);
  });

  it('con el ojito activado, el monto del atajo no se ve', async () => {
    usePrivacidadStore.setState({ oculto: true });
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo({ '/atajos-gasto': { atajos: [cafe], limite: 3 } }));
    renderConProveedores(<Home />);

    expect(await screen.findByRole('button', { name: 'Café $ ••••' })).toBeInTheDocument();
    expect(screen.queryByText(m(5500))).not.toBeInTheDocument();
  });

  it('si el servidor rechaza el gasto, muestra el error y no promete "Deshacer"', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutasConPeriodo({
        '/atajos-gasto': { atajos: [cafe], limite: 3 },
        'POST /periodos/p1/gastos': () => {
          throw new ApiError(409, 'PERIODO_NO_ACTIVO', 'El periodo ya no está activo');
        },
      })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);

    await usuario.click(await screen.findByRole('button', { name: `Café ${m(5500)}` }));

    expect(await screen.findByText('El periodo ya no está activo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument();
  });
});

describe('Home — privacidad de montos (el ojito)', () => {
  it('"Ocultar montos" enmascara la cifra, el disponible y el recordatorio; "Mostrar" los devuelve', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasConPeriodo());
    const usuario = userEvent.setup();
    renderConProveedores(<Home />);
    await screen.findByText('Puedes gastar hoy');
    expect(screen.getAllByText(m(37917)).length).toBeGreaterThan(0);

    await usuario.click(screen.getAllByRole('button', { name: 'Ocultar montos' })[0]!);

    expect(screen.queryByText(m(37917))).not.toBeInTheDocument();
    expect(screen.queryByText(m(455005))).not.toBeInTheDocument();
    expect(screen.getAllByText('$ ••••').length).toBeGreaterThan(0);
    expect(screen.getByText(/Te quedan 12 días con/)).not.toHaveTextContent('$4,550');

    await usuario.click(screen.getAllByRole('button', { name: 'Mostrar montos' })[0]!);
    expect(screen.getAllByText(m(37917)).length).toBeGreaterThan(0);
  });
});
