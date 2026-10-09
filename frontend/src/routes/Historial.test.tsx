import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, descargarArchivo } = vi.hoisted(() => ({ apiFetch: vi.fn(), descargarArchivo: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch, descargarArchivo }));
// Piezas con su propia lógica (desglose, importación de CSV): aquí solo importa que Historial las ponga donde toca.
vi.mock('@/components/DesglosePeriodo', () => ({ DesglosePeriodo: ({ periodoId }: { periodoId: string }) => <div data-testid="desglose">desglose de {periodoId}</div> }));
vi.mock('@/components/FormularioImportar', () => ({ FormularioImportar: ({ tipo }: { tipo: string }) => <div data-testid={`importar-${tipo}`}>importar {tipo}</div> }));

import type { Gasto } from '@/hooks/use-gastos';
import type { Ingreso } from '@/hooks/use-ingresos';
import type { Periodo } from '@/hooks/use-periodo-activo';
import type { Suscripcion } from '@/hooks/use-suscripcion';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Historial } from '@/routes/Historial';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderEnRuta } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const activo: Periodo = { id: 'p-activo', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' };
const cerrado = (id: string, extra: Partial<Periodo> = {}): Periodo => ({ id, cuentaId: 'c1', estado: 'cerrado', fechaInicio: '2026-09-16', fechaFin: '2026-09-30', creadoEn: '2026-09-16T12:00:00Z', ...extra });

const ingreso = (id: string, centavos: number, extra: Partial<Ingreso> = {}): Ingreso => ({ id, periodoId: 'p-activo', monto: pesos(centavos), fechaEfectiva: '2026-10-01', fechaRegistro: '2026-10-01T12:00:00Z', revertido: false, ...extra });
const gasto = (id: string, centavos: number, extra: Partial<Gasto> = {}): Gasto => ({
  id,
  periodoId: 'p-activo',
  monto: pesos(centavos),
  fechaEfectiva: '2026-10-04',
  fechaRegistro: '2026-10-04T12:00:00Z',
  revertido: false,
  esRecurrente: false,
  ...extra,
});

const gratis: Suscripcion = { plan: 'free', estadoSuscripcion: null, suscripcionVigenteHasta: null, cobrosHabilitados: false, avisoProSolicitadoEn: null };

/** Un servidor con periodo activo y listas vacías; cada prueba pisa lo que le interesa. */
function rutas(extra: Rutas = {}): Rutas {
  return {
    '/periodos/activo': activo,
    '/periodos': [activo],
    '/periodos/p-activo/ingresos': [],
    '/periodos/p-activo/gastos': { datos: [], siguienteCursor: null },
    '/periodos/p-activo/pagos-tarjeta': [],
    '/suscripcion': gratis,
    '/categorias': [],
    ...extra,
  };
}

const sinPeriodoActivo = () => {
  throw new ApiError(404, 'PERIODO_NO_ENCONTRADO', 'No hay un periodo activo');
};

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
  descargarArchivo.mockReset().mockResolvedValue(undefined);
});

const montar = (entrada = '/historial') => renderEnRuta(<Historial />, { path: '/historial/:periodoId?', entrada });

describe('Historial — el periodo activo', () => {
  it('lista los ingresos y los gastos vigentes con su monto y nota, y deja fuera los ya corregidos', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p-activo/ingresos': [ingreso('i1', 1000000, { nota: 'Quincena' }), ingreso('i2', 999900, { revertido: true })],
        '/periodos/p-activo/gastos': { datos: [gasto('g1', 12345, { nota: 'tacos' }), gasto('g2', 77700, { revertido: true })], siguienteCursor: null },
      })
    );
    montar();

    expect(await screen.findByText(`+${m(1000000)}`)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-01 — Quincena/)).toBeInTheDocument();
    expect(await screen.findByText(m(12345))).toBeInTheDocument();
    expect(screen.getByText(/tacos/)).toBeInTheDocument();
    expect(screen.queryByText(`+${m(999900)}`)).not.toBeInTheDocument(); // ingreso corregido
    expect(screen.queryByText(m(77700))).not.toBeInTheDocument(); // gasto corregido
    expect(screen.getByText(/^Quincena · /)).toBeInTheDocument();
  });

  it('con las listas vacías lo dice, en vez de dejar un hueco', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByText('Sin ingresos todavía.')).toBeInTheDocument();
    expect(await screen.findByText('Sin gastos todavía.')).toBeInTheDocument();
  });

  it('sin periodo activo explica que no hay nada que ver y no pinta secciones', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/activo': sinPeriodoActivo, '/periodos': [] }));
    montar();

    expect(await screen.findByText('No hay periodo activo todavía.')).toBeInTheDocument();
    expect(screen.queryByText('INGRESOS')).not.toBeInTheDocument();
    expect(screen.queryByText('GASTOS')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver desglose del periodo' })).not.toBeInTheDocument();
  });

  it('un error al cargar los gastos o los ingresos se muestra', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p-activo/ingresos': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer los ingresos'); },
        '/periodos/p-activo/gastos': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer los gastos'); },
      })
    );
    montar();

    expect(await screen.findByText('No se pudieron leer los ingresos')).toBeInTheDocument();
    expect(await screen.findByText('No se pudieron leer los gastos')).toBeInTheDocument();
  });

  it('con "Cargar más" trae la siguiente página de gastos con su cursor y la agrega', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p-activo/gastos': { datos: [gasto('g1', 11100)], siguienteCursor: 'cursor-2' },
        '/periodos/p-activo/gastos?cursor=cursor-2': { datos: [gasto('g2', 22200)], siguienteCursor: null },
      })
    );
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText(m(22200))).toBeInTheDocument();
    expect(screen.getByText(m(11100))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument(); // ya no hay más páginas
  });

  it('muestra los pagos de tarjeta aplicados en su propia sección (nunca aparecen entre los gastos)', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({ '/periodos/p-activo/pagos-tarjeta': [{ tarjetaNombre: 'BBVA', cargoDescripcion: 'Laptop', numeroPago: 2, numeroPlazos: 6, monto: pesos(150000) }] })
    );
    montar();

    expect(await screen.findByText('PAGOS DE TARJETA')).toBeInTheDocument();
    expect(screen.getByText('BBVA — Laptop (2/6)')).toBeInTheDocument();
    expect(screen.getByText(m(150000))).toBeInTheDocument();
  });

  it('el ojito enmascara los montos del historial', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p-activo/gastos': { datos: [gasto('g1', 12345)], siguienteCursor: null } }));
    const usuario = userEvent.setup();
    montar();
    await screen.findByText(m(12345));

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));

    expect(screen.queryByText(m(12345))).not.toBeInTheDocument();
    expect(screen.getAllByText('$ ••••').length).toBeGreaterThan(0);
  });
});

describe('Historial — filtros y desglose', () => {
  async function conDatos() {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p-activo/ingresos': [ingreso('i1', 1000000)],
        '/periodos/p-activo/gastos': { datos: [gasto('g1', 12345)], siguienteCursor: null },
      })
    );
    const usuario = userEvent.setup();
    montar();
    await screen.findByText(m(12345));
    return usuario;
  }

  it('por omisión muestra todo; "ingresos" esconde los gastos y "gastos" esconde los ingresos', async () => {
    const usuario = await conDatos();
    expect(screen.getByText('INGRESOS')).toBeInTheDocument();
    expect(screen.getByText('GASTOS')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'ingresos' }));
    expect(screen.getByText('INGRESOS')).toBeInTheDocument();
    expect(screen.queryByText('GASTOS')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'gastos' }));
    expect(screen.queryByText('INGRESOS')).not.toBeInTheDocument();
    expect(screen.getByText('GASTOS')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'todo' }));
    expect(screen.getByText('INGRESOS')).toBeInTheDocument();
    expect(screen.getByText('GASTOS')).toBeInTheDocument();
  });

  it('el desglose empieza cerrado y se abre y cierra con su botón, con el periodo que se está viendo', async () => {
    const usuario = await conDatos();
    expect(screen.queryByTestId('desglose')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Ver desglose del periodo' }));
    expect(screen.getByTestId('desglose')).toHaveTextContent('desglose de p-activo');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar desglose' }));
    expect(screen.queryByTestId('desglose')).not.toBeInTheDocument();
  });

  it('el enlace de Home (?desglose=1) lo abre de entrada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar('/historial?desglose=1');

    expect(await screen.findByTestId('desglose')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar desglose' })).toBeInTheDocument();
  });
});

describe('Historial — exportar a CSV (función de Pro)', () => {
  it('en el plan gratis los botones están desactivados y explica por qué (Pro llegará pronto)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByText(/Exportar a CSV es parte de Korly Pro, que llegará pronto/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gastos \(CSV\)/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Ingresos \(CSV\)/ })).toBeDisabled();
  });

  it('con cobros habilitados dice dónde se contrata', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/suscripcion': { ...gratis, cobrosHabilitados: true } }));
    montar();

    expect(await screen.findByText(/lo contratas en Ajustes → Plan/)).toBeInTheDocument();
  });

  it('en Pro los botones funcionan y descargan el archivo que toca', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/suscripcion': { ...gratis, plan: 'pro', estadoSuscripcion: 'activa' } }));
    const usuario = userEvent.setup();
    montar();
    const botonGastos = await screen.findByRole('button', { name: /Gastos \(CSV\)/ });
    await waitFor(() => expect(botonGastos).toBeEnabled());

    await usuario.click(botonGastos);
    await usuario.click(screen.getByRole('button', { name: /Ingresos \(CSV\)/ }));

    await waitFor(() => expect(descargarArchivo).toHaveBeenCalledTimes(2));
    expect(descargarArchivo).toHaveBeenNthCalledWith(1, '/exportar/gastos.csv', 'gastos.csv');
    expect(descargarArchivo).toHaveBeenNthCalledWith(2, '/exportar/ingresos.csv', 'ingresos.csv');
    expect(screen.queryByText(/Exportar a CSV es parte de Korly Pro/)).not.toBeInTheDocument();
  });

  it('si la descarga falla, muestra el error', async () => {
    descargarArchivo.mockRejectedValue(new Error('No se pudo descargar'));
    servidor = instalarServidorFalso(apiFetch, rutas({ '/suscripcion': { ...gratis, plan: 'pro', estadoSuscripcion: 'activa' } }));
    const usuario = userEvent.setup();
    montar();
    const boton = await screen.findByRole('button', { name: /Gastos \(CSV\)/ });
    await waitFor(() => expect(boton).toBeEnabled());

    await usuario.click(boton);

    expect(await screen.findByText('No se pudo descargar')).toBeInTheDocument();
  });
});

describe('Historial — periodos anteriores', () => {
  it('lista los cerrados y archivados (no el activo ni los borradores) con enlace al historial y al resumen de cada uno', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos': [activo, cerrado('p-cerrado'), cerrado('p-archivado', { estado: 'archivado', fechaInicio: '2026-09-01', fechaFin: '2026-09-15' }), cerrado('p-borrador', { estado: 'borrador', fechaInicio: '2026-11-01', fechaFin: '2026-11-15' })],
      })
    );
    montar();

    expect(await screen.findByText('PERIODOS ANTERIORES')).toBeInTheDocument();
    const enlacesHistorial = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/historial/'));
    expect(enlacesHistorial.map((a) => a.getAttribute('href'))).toEqual(['/historial/p-cerrado', '/historial/p-archivado']);
    const enlacesResumen = screen.getAllByRole('link', { name: 'Ver resumen' });
    expect(enlacesResumen.map((a) => a.getAttribute('href'))).toEqual(['/resumen/p-cerrado', '/resumen/p-archivado']);
  });

  it('cuando dos periodos cerrados tienen el mismo rango, muestra cuándo se creó cada uno para distinguirlos', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({ '/periodos': [activo, cerrado('a', { creadoEn: '2026-09-17T15:00:00Z' }), cerrado('b', { creadoEn: '2026-09-20T18:30:00Z' })] })
    );
    montar();

    await screen.findByText('PERIODOS ANTERIORES');
    expect(screen.getAllByText(/— creado /)).toHaveLength(2);
  });

  it('con rangos distintos no ensucia la lista con "creado"', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos': [activo, cerrado('a'), cerrado('b', { fechaInicio: '2026-09-01', fechaFin: '2026-09-15' })] }));
    montar();

    await screen.findByText('PERIODOS ANTERIORES');
    expect(screen.queryByText(/— creado /)).not.toBeInTheDocument();
  });

  it('sin periodos cerrados no hay sección', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    await screen.findByText('Sin gastos todavía.');
    expect(screen.queryByText('PERIODOS ANTERIORES')).not.toBeInTheDocument();
  });
});

describe('Historial — ver un periodo cerrado (/historial/:periodoId)', () => {
  function rutasDeCerrado() {
    const viejo = cerrado('p-cerrado');
    return rutas({
      '/periodos': [activo, viejo],
      '/periodos/p-cerrado/ingresos': [ingreso('i9', 500000, { periodoId: 'p-cerrado' })],
      '/periodos/p-cerrado/gastos': { datos: [gasto('g9', 4200, { periodoId: 'p-cerrado' })], siguienteCursor: null },
      '/periodos/p-cerrado/pagos-tarjeta': [],
    });
  }

  it('muestra los movimientos de ESE periodo, dice que está cerrado y ofrece volver al activo', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasDeCerrado());
    montar('/historial/p-cerrado');

    expect(await screen.findByText(`+${m(500000)}`)).toBeInTheDocument();
    expect(await screen.findByText(m(4200))).toBeInTheDocument();
    expect(screen.getByText(/· cerrado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ver periodo activo' })).toHaveAttribute('href', '/historial');
    expect(servidor.llamadasA('GET', '/periodos/p-activo/gastos')).toHaveLength(0); // no pidió los del activo
  });

  it('en un periodo cerrado NO se ofrece importar (solo vale para el activo)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasDeCerrado());
    montar('/historial/p-cerrado');

    await screen.findByText(m(4200));
    expect(screen.queryByTestId('importar-gastos')).not.toBeInTheDocument();
    expect(screen.queryByTestId('importar-ingresos')).not.toBeInTheDocument();
  });

  it('en el periodo activo sí se ofrece importar gastos e ingresos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByTestId('importar-gastos')).toBeInTheDocument();
    expect(screen.getByTestId('importar-ingresos')).toBeInTheDocument();
  });

  it('el periodo que se ve no aparece también en "periodos anteriores"', async () => {
    servidor = instalarServidorFalso(apiFetch, rutasDeCerrado());
    montar('/historial/p-cerrado');

    await screen.findByText(m(4200));
    expect(screen.queryByText('PERIODOS ANTERIORES')).not.toBeInTheDocument();
  });
});
