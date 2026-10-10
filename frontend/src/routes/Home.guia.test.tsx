import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, updateUser } = vi.hoisted(() => ({ apiFetch: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser, getSession: vi.fn().mockResolvedValue({ data: { session: null } }), onAuthStateChange: vi.fn() } },
}));

import type { Disponible } from '@/hooks/use-disponible';
import { ApiError } from '@/lib/api';
import { TEXTOS_GUIA } from '@/lib/guia';
import { Home } from '@/routes/Home';
import { useAuthStore } from '@/stores/auth-store';
import { useGuiaStore } from '@/stores/guia-store';
import { instalarServidorFalso, type Rutas } from '@/test/servidor-falso';
import { pesos, renderEnRuta } from '@/test/utilidades';

const periodo = { id: 'p1', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' };
const sinPeriodo = () => {
  throw new ApiError(404, 'PERIODO_NO_ENCONTRADO', 'No hay un periodo activo');
};
const conCifra: Disponible = {
  estado: 'ok',
  periodoId: 'p1',
  disponible: pesos(455005),
  diasRestantes: 12,
  cifraDiaria: pesos(37917),
  gastadoHoy: pesos(0),
  huboActividadHoy: false,
  calculadoEn: '2026-10-04T12:00:00Z',
};
const gasto = { id: 'g1', periodoId: 'p1', monto: pesos(5500), fechaEfectiva: '2026-10-04', fechaRegistro: '2026-10-04T12:00:00Z', revertido: false, esRecurrente: false };
const cafe = { id: 'a1', nombre: 'Café', monto: pesos(5500), categoriaId: null };

function rutas(extra: Rutas = {}): Rutas {
  return {
    '/periodos/activo/disponible': conCifra,
    '/periodos/activo': periodo,
    '/resumenes/pendiente': null,
    '/periodos/p1/pagos-tarjeta': [],
    '/periodos/p1/gastos': { datos: [], siguienteCursor: null },
    '/periodos/p1/desglose': { periodoId: 'p1', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', totalGastado: pesos(0), totalVariable: pesos(0), recurrentes: { total: pesos(0), items: [] }, rubros: [], semanas: [], semanaMasCara: null },
    '/categorias': [],
    '/atajos-gasto': { atajos: [], limite: 3 },
    ...extra,
  };
}

const sinQuincena = { '/periodos/activo/disponible': sinPeriodo, '/periodos/activo': sinPeriodo };

function conCuenta(creada: string, metadatos: Record<string, unknown> = {}) {
  useAuthStore.setState({ session: { user: { id: 'u1', created_at: creada, user_metadata: metadatos } } as never, cargando: false });
}

const montar = () => renderEnRuta(<Home />, { path: '/', entrada: '/' });
const guiaVisible = () => screen.queryByRole('region', { name: 'Guía de Korly' });

beforeEach(() => {
  localStorage.clear();
  updateUser.mockReset();
  updateUser.mockResolvedValue({ error: null });
  useGuiaStore.setState({ vistos: {}, terminadas: {} });
  conCuenta(new Date().toISOString());
});

describe('Guía de primeros pasos en Inicio — quién la ve', () => {
  it('una cuenta anterior al lanzamiento de la guía no ve nada', async () => {
    conCuenta('2026-10-01T00:00:00Z');
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    montar();

    await screen.findByText('Empecemos');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('una cuenta que ya la terminó no la ve aunque sea nueva', async () => {
    conCuenta(new Date().toISOString(), { guia_terminada: true });
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    montar();

    await screen.findByText('Empecemos');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Guía — de la bienvenida al ingreso', () => {
  it('bienvenida → explicación de la quincena → se va al seguir', async () => {
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    const usuario = userEvent.setup();
    montar();

    const bienvenida = await screen.findByRole('dialog', { name: 'Bienvenido a Korly' });
    expect(bienvenida).toHaveTextContent(TEXTOS_GUIA.bienvenida.texto);
    await usuario.click(within(bienvenida).getByRole('button', { name: 'Empezar' }));

    expect(await screen.findByRole('region', { name: 'Guía de Korly' })).toHaveTextContent(TEXTOS_GUIA.quincena.texto);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('cerrar la bienvenida con Escape cuenta como "Empezar": no apaga la guía', async () => {
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    const usuario = userEvent.setup();
    montar();
    await screen.findByRole('dialog', { name: 'Bienvenido a Korly' });

    await usuario.keyboard('{Escape}');

    expect(await screen.findByRole('region', { name: 'Guía de Korly' })).toHaveTextContent(TEXTOS_GUIA.quincena.texto);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('"Saltar guía" la apaga para siempre en la cuenta (guia_terminada) y nada más se muestra', async () => {
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Saltar guía' }));

    expect(updateUser).toHaveBeenCalledWith({ data: { guia_terminada: true } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('saltarla se recuerda en el navegador aunque la página se recargue antes de que la cuenta confirme el cambio', async () => {
    instalarServidorFalso(apiFetch, rutas(sinQuincena));
    const usuario = userEvent.setup();
    const primera = montar();
    await usuario.click(await screen.findByRole('button', { name: 'Saltar guía' }));
    primera.unmount();
    useGuiaStore.setState({ vistos: {}, terminadas: {} }); // recarga: la memoria se vacía y la cuenta aún no refleja el cambio

    montar();

    await screen.findByText('Empecemos');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con quincena pero sin ingreso explica el ingreso', async () => {
    instalarServidorFalso(apiFetch, rutas({ '/periodos/activo/disponible': { estado: 'sin_ingreso', periodoId: 'p1', calculadoEn: 'x' } }));
    const usuario = userEvent.setup();
    montar();

    expect(await screen.findByRole('region', { name: 'Guía de Korly' })).toHaveTextContent(TEXTOS_GUIA.ingreso.texto);
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(guiaVisible()).not.toBeInTheDocument();
  });
});

describe('Guía — con la cifra', () => {
  it('la cifra primero, luego "Registrar gasto", y al terminar no queda nada (sin atajos ni gastos)', async () => {
    instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();

    expect(await screen.findByRole('region', { name: 'Guía de Korly' })).toHaveTextContent(TEXTOS_GUIA.cifra.texto);
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText(TEXTOS_GUIA['registrar-gasto'].texto)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('abrir "Registrar gasto" por su cuenta cuenta como haber leído ese paso', async () => {
    instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    montar();
    await usuario.click(await screen.findByRole('button', { name: 'Siguiente' })); // la cifra

    await usuario.click(screen.getByRole('button', { name: 'Registrar gasto' }));

    expect(await screen.findByRole('dialog', { name: 'Nuevo gasto' })).toBeInTheDocument();
    expect(screen.queryByText(TEXTOS_GUIA['registrar-gasto'].texto)).not.toBeInTheDocument();
  });

  it('la guía no regresa al recargar: lo visto se recuerda en el navegador', async () => {
    instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    const primera = montar();
    await usuario.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await usuario.click(await screen.findByRole('button', { name: 'Entendido' }));
    primera.unmount();
    useGuiaStore.setState({ vistos: {} }); // como una carga nueva: la memoria vuelve a leerse del navegador

    montar();
    await screen.findByRole('button', { name: 'Registrar gasto' });

    expect(guiaVisible()).not.toBeInTheDocument();
  });
});

describe('Guía — atajos, recurrentes y cierre', () => {
  const yaLeyoLoBasico = () => useGuiaStore.setState({ vistos: { u1: ['bienvenida', 'quincena', 'ingreso', 'cifra', 'registrar-gasto'] } });

  it('con un atajo creado, explica cómo se usa', async () => {
    yaLeyoLoBasico();
    instalarServidorFalso(apiFetch, rutas({ '/atajos-gasto': { atajos: [cafe], limite: 3 } }));
    const usuario = userEvent.setup();
    montar();

    expect(await screen.findByRole('region', { name: 'Guía de Korly' })).toHaveTextContent(TEXTOS_GUIA['atajo-inicio'].texto);
    await usuario.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('tras el primer gasto, avisa de los gastos recurrentes; "Ahora no" sigue al cierre', async () => {
    yaLeyoLoBasico();
    instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/gastos': { datos: [gasto], siguienteCursor: null } }));
    const usuario = userEvent.setup();
    montar();

    const paso = await screen.findByRole('region', { name: 'Guía de Korly' });
    expect(paso).toHaveTextContent('¿Tienes gastos que se repiten?');
    expect(paso).toHaveTextContent('Si le toca a esta quincena, se descuentan de inmediato de tu cifra del día.');
    await usuario.click(screen.getByRole('button', { name: 'Ahora no' }));

    const cierre = await screen.findByRole('region', { name: 'Guía de Korly' });
    expect(cierre).toHaveTextContent('Listo, ya sabes lo principal');
    expect(screen.queryByRole('button', { name: 'Saltar guía' })).not.toBeInTheDocument(); // el último paso ya cierra por sí mismo
  });

  it('"Ver gastos recurrentes" lleva a esa pantalla', async () => {
    yaLeyoLoBasico();
    instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/gastos': { datos: [gasto], siguienteCursor: null } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Ver gastos recurrentes' }));

    expect(await screen.findByTestId('otra-ruta')).toBeInTheDocument();
  });

  it('un gasto automático (recurrente) o ya borrado no cuenta como "primer gasto"', async () => {
    yaLeyoLoBasico();
    instalarServidorFalso(
      apiFetch,
      rutas({ '/periodos/p1/gastos': { datos: [{ ...gasto, esRecurrente: true }, { ...gasto, id: 'g2', revertido: true }], siguienteCursor: null } })
    );
    montar();

    await screen.findByRole('button', { name: 'Registrar gasto' });
    expect(guiaVisible()).not.toBeInTheDocument();
  });

  it('"Terminar" en el cierre apaga la guía en la cuenta', async () => {
    useGuiaStore.setState({ vistos: { u1: ['bienvenida', 'quincena', 'ingreso', 'cifra', 'registrar-gasto', 'recurrentes'] } });
    instalarServidorFalso(apiFetch, rutas({ '/periodos/p1/gastos': { datos: [gasto], siguienteCursor: null } }));
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Terminar' }));

    expect(updateUser).toHaveBeenCalledWith({ data: { guia_terminada: true } });
    await waitFor(() => expect(guiaVisible()).not.toBeInTheDocument());
  });
});
