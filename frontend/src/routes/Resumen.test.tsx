import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));
vi.mock('@/components/DesglosePeriodo', () => ({ DesglosePeriodo: ({ periodoId }: { periodoId: string }) => <div data-testid="desglose">desglose de {periodoId}</div> }));

import type { Periodo } from '@/hooks/use-periodo-activo';
import type { Resumen as ResumenDto } from '@/hooks/use-resumen';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Resumen } from '@/routes/Resumen';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderEnRuta } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const resumen = (extra: Partial<ResumenDto> = {}): ResumenDto => ({
  periodoId: 'p1',
  totalIngresos: pesos(1000000),
  totalGastado: pesos(850000),
  sobrante: pesos(150000),
  decisionSobrante: 'pendiente',
  generadoEn: '2026-10-16T12:00:00Z',
  ...extra,
});

// Fechas lejanas a propósito: "¿se puede reabrir?" depende de que el fin del periodo no haya pasado respecto a HOY.
const periodo = (extra: Partial<Periodo> = {}): Periodo => ({ id: 'p1', cuentaId: 'c1', estado: 'cerrado', fechaInicio: '2099-12-16', fechaFin: '2099-12-31', creadoEn: '2099-12-16T00:00:00Z', ...extra });
const periodoActivo = periodo({ id: 'p2', estado: 'activo', fechaInicio: '2100-01-01', fechaFin: '2100-01-15' });

const metas = [
  { id: 'm1', nombre: 'Vacaciones', montoObjetivo: pesos(1000000), montoAcumulado: pesos(0), porcentajeAvance: 0 },
  { id: 'm2', nombre: 'Laptop', montoObjetivo: pesos(2000000), montoAcumulado: pesos(500000), porcentajeAvance: 25 },
];

function rutas(extra: Rutas = {}): Rutas {
  return { '/periodos/p1/resumen': resumen(), '/metas': metas, '/periodos': [periodo()], ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

const montar = () => renderEnRuta(<Resumen />, { path: '/resumen/:periodoId', entrada: '/resumen/p1' });

describe('Resumen — las cifras del periodo cerrado', () => {
  it('muestra el sobrante, lo que entró y lo que se gastó, y pasa el periodo al desglose', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByText('Sobrante del periodo')).toBeInTheDocument();
    expect(screen.getByText(m(150000))).toBeInTheDocument();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getByText(m(1000000))).toBeInTheDocument();
    expect(screen.getByText('Gastado')).toBeInTheDocument();
    expect(screen.getByText(m(850000))).toBeInTheDocument();
    expect(screen.getByTestId('desglose')).toHaveTextContent('desglose de p1');
  });

  it('un sobrante negativo se presenta como déficit (y su monto en rojo)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': resumen({ sobrante: pesos(-30000), totalGastado: pesos(1030000), decisionSobrante: 'arrastrado' }) }));
    montar();

    expect(await screen.findByText('Déficit del periodo')).toBeInTheDocument();
    expect(screen.queryByText('Sobrante del periodo')).not.toBeInTheDocument();
    expect(screen.getByText(m(-30000))).toHaveClass('text-red-400');
    expect(screen.getByText('Este déficit se arrastrará al periodo siguiente.')).toBeInTheDocument();
    expect(screen.queryByText('¿Qué hacemos con el sobrante?')).not.toBeInTheDocument();
  });

  it('un error al cargar el resumen se muestra', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': () => { throw new ApiError(404, 'RESUMEN_NO_ENCONTRADO', 'Ese periodo todavía no tiene resumen') } }));
    montar();

    expect(await screen.findByText('Ese periodo todavía no tiene resumen')).toBeInTheDocument();
    expect(screen.queryByText('Sobrante del periodo')).not.toBeInTheDocument();
  });

  it('el ojito enmascara las tres cifras', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();
    await screen.findByText(m(150000));

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));

    for (const centavos of [150000, 1000000, 850000]) expect(screen.queryByText(m(centavos))).not.toBeInTheDocument();
    expect(screen.getAllByText('$ ••••')).toHaveLength(3);
  });
});

describe('Resumen — qué hacer con el sobrante', () => {
  it('con el sobrante ya arrastrado lo dice y no vuelve a preguntar', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': resumen({ decisionSobrante: 'arrastrado' }) }));
    montar();

    expect(await screen.findByText('Este sobrante se arrastrará al periodo siguiente.')).toBeInTheDocument();
    expect(screen.queryByText('¿Qué hacemos con el sobrante?')).not.toBeInTheDocument();
  });

  it('una decisión de ahorrar queda dicha como ahorro', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': resumen({ decisionSobrante: 'ahorrado' }) }));
    montar();

    expect(await screen.findByText('Este sobrante se guardó como ahorro.')).toBeInTheDocument();
    expect(screen.queryByText('¿Qué hacemos con el sobrante?')).not.toBeInTheDocument();
  });

  it('"Arrastrar al periodo siguiente" manda la decisión y la pantalla pasa a mostrarla', async () => {
    let actual = resumen();
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p1/resumen': () => actual,
        'POST /periodos/p1/sobrante/decision': () => {
          actual = resumen({ decisionSobrante: 'arrastrado' });
          return { periodoId: 'p1', decision: 'arrastrado', montoAplicado: pesos(150000) };
        },
      })
    );
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Arrastrar al periodo siguiente' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos/p1/sobrante/decision')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos/p1/sobrante/decision')[0]?.cuerpo).toEqual({ decision: 'arrastrar' });
    expect(await screen.findByText('Este sobrante se arrastrará al periodo siguiente.')).toBeInTheDocument();
    expect(screen.queryByText('¿Qué hacemos con el sobrante?')).not.toBeInTheDocument();
  });

  it('"Ahorrar en una meta": hay que elegir una, y se manda la meta elegida', async () => {
    let actual = resumen();
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/periodos/p1/resumen': () => actual,
        'POST /periodos/p1/sobrante/decision': () => {
          actual = resumen({ decisionSobrante: 'ahorrado' });
          return { periodoId: 'p1', decision: 'ahorrado', montoAplicado: pesos(150000) };
        },
      })
    );
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Ahorrar en una meta' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled(); // sin meta elegida no se puede confirmar
    await usuario.selectOptions(screen.getByRole('combobox'), 'm2');
    expect(confirmar).toBeEnabled();
    await usuario.click(confirmar);

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos/p1/sobrante/decision')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos/p1/sobrante/decision')[0]?.cuerpo).toEqual({ decision: 'ahorrar', metaId: 'm2' });
    expect(await screen.findByText('Este sobrante se guardó como ahorro.')).toBeInTheDocument();
  });

  it('el selector de meta lista las metas por nombre y "Cancelar" lo cierra sin mandar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Ahorrar en una meta' }));
    expect(screen.getByRole('option', { name: 'Vacaciones' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Laptop' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ahorrar en una meta' })).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/periodos/p1/sobrante/decision')).toHaveLength(0);
  });

  it('sin metas no se puede ahorrar y se explica qué hacer primero', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/metas': [] }));
    montar();

    const boton = await screen.findByRole('button', { name: 'Ahorrar en una meta' });
    await waitFor(() => expect(boton).toBeDisabled());
    expect(boton).toHaveAttribute('title', 'Primero crea una meta en "Ver metas"');
  });

  it('si el servidor rechaza la decisión, lo dice y sigue pendiente', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos/p1/sobrante/decision': () => { throw new ApiError(409, 'DECISION_YA_TOMADA', 'Ya decidiste qué hacer con este sobrante') } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Arrastrar al periodo siguiente' }));

    expect(await screen.findByText('Ya decidiste qué hacer con este sobrante')).toBeInTheDocument();
    expect(screen.getByText('¿Qué hacemos con el sobrante?')).toBeInTheDocument();
  });
});

describe('Resumen — reabrir un periodo cerrado sin querer', () => {
  it('mientras la quincena siga vigente y el sobrante no se haya ahorrado, ofrece reabrir', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    montar();

    expect(await screen.findByText('¿Lo cerraste sin querer?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir periodo' })).toBeInTheDocument();
  });

  it('también cuando el sobrante ya se decidió arrastrar (el servidor valida el resto)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': resumen({ decisionSobrante: 'arrastrado' }) }));
    montar();

    expect(await screen.findByRole('button', { name: 'Reabrir periodo' })).toBeInTheDocument();
  });

  it('si el sobrante ya se guardó en una meta, no se ofrece', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/resumen': resumen({ decisionSobrante: 'ahorrado' }) }));
    montar();

    await screen.findByText('Este sobrante se guardó como ahorro.');
    expect(screen.queryByText('¿Lo cerraste sin querer?')).not.toBeInTheDocument();
  });

  it('si la quincena ya terminó, no se ofrece', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos': [periodo({ fechaInicio: '2020-01-01', fechaFin: '2020-01-15' })] }));
    montar();

    await screen.findByText('Sobrante del periodo');
    await waitFor(() => expect(servidor.llamadasA('GET', '/periodos')).toHaveLength(1));
    expect(screen.queryByText('¿Lo cerraste sin querer?')).not.toBeInTheDocument();
  });

  it('si el periodo no está cerrado (archivado), no se ofrece', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos': [periodo({ estado: 'archivado' })] }));
    montar();

    await screen.findByText('Sobrante del periodo');
    await waitFor(() => expect(servidor.llamadasA('GET', '/periodos')).toHaveLength(1));
    expect(screen.queryByText('¿Lo cerraste sin querer?')).not.toBeInTheDocument();
  });

  it('"Reabrir periodo" lo pide al servidor y regresa a Inicio', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos/p1/reabrir': { periodoId: 'p1', estado: 'activo' } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Reabrir periodo' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos/p1/reabrir')).toHaveLength(1));
    expect(await screen.findByTestId('otra-ruta')).toBeInTheDocument(); // navegó a "/"
  });

  it('si el servidor no deja reabrirlo, muestra la razón tal cual y se queda en el resumen', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({ 'POST /periodos/p1/reabrir': () => { throw new ApiError(409, 'NO_SE_PUEDE_REABRIR', 'El sobrante ya se arrastró al periodo siguiente') } })
    );
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Reabrir periodo' }));

    expect(await screen.findByText('El sobrante ya se arrastró al periodo siguiente')).toBeInTheDocument();
    expect(screen.queryByTestId('otra-ruta')).not.toBeInTheDocument();
  });
});

describe('Resumen — crear el periodo siguiente', () => {
  it('sin ningún periodo activo ofrece crear el siguiente, y al crearlo regresa a Inicio', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos': periodoActivo }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Crear periodo siguiente' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/periodos')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos')[0]?.cuerpo).toEqual({ tipo: 'quincenal' });
    expect(await screen.findByTestId('otra-ruta')).toBeInTheDocument();
  });

  it('con un periodo activo NO se ofrece (crearlo dejaría un borrador duplicado de la misma quincena)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos': [periodo(), periodoActivo] }));
    montar();

    await screen.findByText('Sobrante del periodo');
    await waitFor(() => expect(servidor.llamadasA('GET', '/periodos')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Crear periodo siguiente' })).not.toBeInTheDocument();
  });

  it('si la lista de periodos todavía no llega, tampoco se ofrece (no se adivina)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/periodos': () => new Promise(() => undefined) }));
    montar();

    await screen.findByText('Sobrante del periodo');
    expect(screen.queryByRole('button', { name: 'Crear periodo siguiente' })).not.toBeInTheDocument();
  });

  it('si el servidor no deja crearlo, lo dice', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /periodos': () => { throw new ApiError(409, 'PERIODO_ACTIVO_EXISTENTE', 'Ya tienes un periodo activo') } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Crear periodo siguiente' }));

    expect(await screen.findByText('Ya tienes un periodo activo')).toBeInTheDocument();
  });
});
