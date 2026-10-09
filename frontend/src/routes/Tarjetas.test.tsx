import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { CargoTarjeta } from '@/hooks/use-cargos-tarjeta';
import type { Tarjeta } from '@/hooks/use-tarjetas';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Tarjetas } from '@/routes/Tarjetas';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const bbva: Tarjeta = { id: 't1', nombre: 'BBVA Oro', limiteCredito: pesos(5000000), deuda: pesos(1250000), creditoDisponible: pesos(3750000), diaCorte: 12, diasParaPago: 20 };
const nu: Tarjeta = { id: 't2', nombre: 'Nu', limiteCredito: pesos(2000000), deuda: pesos(0), creditoDisponible: pesos(2000000), diaCorte: 3, diasParaPago: 18 };

const cargo = (id: string, extra: Partial<CargoTarjeta> = {}): CargoTarjeta => ({
  id,
  descripcion: 'Laptop',
  montoTotal: pesos(1800000),
  numeroPlazos: 6,
  categoriaId: null,
  fechaCompra: '2026-09-20',
  revertido: false,
  mensualidades: [
    { numeroPago: 1, monto: pesos(300000), fechaVencimiento: '2026-10-30', pagado: true },
    { numeroPago: 2, monto: pesos(300000), fechaVencimiento: '2026-11-30', pagado: false },
  ],
  ...extra,
});

function rutas(extra: Rutas = {}): Rutas {
  return { '/tarjetas': [bbva, nu], '/categorias': [], '/periodos/activo/disponible': { estado: 'ok' }, ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

/** Hay dos botones "Nueva tarjeta" (uno en el encabezado de escritorio y otro abajo en móvil); la pantalla decide cuál se ve con CSS. */
const botonesNuevaTarjeta = () => screen.getAllByRole('button', { name: /Nueva tarjeta/ });

describe('Tarjetas — la lista', () => {
  it('muestra cada tarjeta con lo que debes, lo que te queda de crédito, su corte y los días para pagar', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Tarjetas />);

    expect(await screen.findByText('BBVA Oro')).toBeInTheDocument();
    expect(screen.getByText(m(1250000))).toBeInTheDocument(); // Debes
    expect(screen.getByText(`${m(3750000)} disponible de ${m(5000000)}`)).toBeInTheDocument();
    expect(screen.getByText('Corte día 12')).toBeInTheDocument();
    expect(screen.getByText('20 días para pagar')).toBeInTheDocument();
    expect(screen.getByText('Nu')).toBeInTheDocument();
    expect(screen.getByText('Corte día 3')).toBeInTheDocument();
    expect(screen.getByText('18 días para pagar')).toBeInTheDocument();
  });

  it('sin tarjetas lo dice, y sigue ofreciendo agregar una', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas': [] }));
    renderConProveedores(<Tarjetas />);

    expect(await screen.findByText('Todavía no tienes ninguna tarjeta registrada.')).toBeInTheDocument();
    expect(botonesNuevaTarjeta().length).toBeGreaterThan(0);
  });

  it('un error del servidor se muestra, no una pantalla vacía', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus tarjetas'); } }));
    renderConProveedores(<Tarjetas />);

    expect(await screen.findByText('No se pudieron leer tus tarjetas')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no tienes ninguna tarjeta registrada.')).not.toBeInTheDocument();
  });

  it('el ojito enmascara la deuda, el crédito disponible y el límite', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));

    expect(screen.queryByText(m(1250000))).not.toBeInTheDocument();
    expect(screen.queryByText(`${m(3750000)} disponible de ${m(5000000)}`)).not.toBeInTheDocument();
    expect(screen.getAllByText('$ ••••').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$ •••• disponible de $ ••••')).toHaveLength(2); // una por tarjeta
  });
});

describe('Tarjetas — dar de alta una tarjeta', () => {
  it('"Nueva tarjeta" abre la hoja y "Cancelar" la cierra sin mandar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(botonesNuevaTarjeta()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });
    await usuario.click(within(hoja).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(servidor.llamadasA('POST', '/tarjetas')).toHaveLength(0);
  });

  it('el formulario valida: sin nombre, límite en cero y corte fuera de 1–31 no se manda', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await usuario.click((await screen.findAllByRole('button', { name: /Nueva tarjeta/ }))[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });

    await usuario.type(within(hoja).getByLabelText('Límite de crédito'), '0');
    await usuario.type(within(hoja).getByLabelText('Día de corte'), '40');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText(/Ponle un nombre/)).toBeInTheDocument();
    expect(within(hoja).getByText('El límite debe ser mayor a cero')).toBeInTheDocument();
    expect(within(hoja).getByText('Debe estar entre 1 y 31')).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/tarjetas')).toHaveLength(0);
  });

  it('crea la tarjeta con el límite en centavos y los días de pago por omisión (20), cierra la hoja y vuelve a leer la lista', async () => {
    let tarjetas = [bbva];
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas': () => tarjetas, 'POST /tarjetas': () => { tarjetas = [bbva, nu]; return nu; } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await usuario.click((await screen.findAllByRole('button', { name: /Nueva tarjeta/ }))[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });

    await usuario.type(within(hoja).getByLabelText('Nombre'), 'Nu');
    await usuario.type(within(hoja).getByLabelText('Límite de crédito'), '20000.50');
    await usuario.type(within(hoja).getByLabelText('Día de corte'), '3');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/tarjetas')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/tarjetas')[0]?.cuerpo).toEqual({ nombre: 'Nu', limiteCredito: { valorMinimo: 2000050, moneda: 'MXN' }, diaCorte: 3, diasParaPago: 20 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Corte día 3')).toBeInTheDocument(); // la lista se refrescó con la nueva
  });

  it('si el servidor rechaza la tarjeta, la hoja sigue abierta y dice por qué', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /tarjetas': () => { throw new ApiError(400, 'VALIDACION', 'Ya tienes una tarjeta con ese nombre'); } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await usuario.click((await screen.findAllByRole('button', { name: /Nueva tarjeta/ }))[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });

    await usuario.type(within(hoja).getByLabelText('Nombre'), 'BBVA Oro');
    await usuario.type(within(hoja).getByLabelText('Límite de crédito'), '50000');
    await usuario.type(within(hoja).getByLabelText('Día de corte'), '12');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText('Ya tienes una tarjeta con ese nombre')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nueva tarjeta' })).toBeInTheDocument();
  });
});

describe('Tarjetas — compras y mensualidades', () => {
  it('"Ver compras" muestra cada compra con su plazo (MSI) y qué mensualidades ya se pagaron; "Ocultar" las esconde', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas/t1/cargos': [cargo('c1')] }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: /Ver compras/ })[0]!);

    expect(await screen.findByText(`Laptop — ${m(1800000)} a 6 MSI`)).toBeInTheDocument();
    expect(screen.getByText(`1/6 — ${m(300000)} — vence 2026-10-30`)).toBeInTheDocument();
    expect(screen.getByText(`2/6 — ${m(300000)} — vence 2026-11-30`)).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByText(/a 6 MSI/)).not.toBeInTheDocument();
  });

  it('una compra a un solo pago no dice "MSI", y las ya corregidas no se muestran', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({ '/tarjetas/t1/cargos': [cargo('c1', { descripcion: 'Súper', numeroPlazos: 1, montoTotal: pesos(85000), mensualidades: [] }), cargo('c2', { descripcion: 'Error de dedo', revertido: true })] })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: /Ver compras/ })[0]!);

    expect(await screen.findByText(`Súper — ${m(85000)}`)).toBeInTheDocument();
    expect(screen.queryByText(/MSI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error de dedo/)).not.toBeInTheDocument();
  });

  it('sin compras lo dice', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas/t1/cargos': [] }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: /Ver compras/ })[0]!);

    expect(await screen.findByText('Todavía no hay compras registradas.')).toBeInTheDocument();
  });

  it('solo pide las compras de la tarjeta cuyas compras abres (no las de todas)', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas/t1/cargos': [], '/tarjetas/t2/cargos': [] }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('Nu');

    await usuario.click(screen.getAllByRole('button', { name: /Ver compras/ })[1]!);

    await waitFor(() => expect(servidor.llamadasA('GET', '/tarjetas/t2/cargos')).toHaveLength(1));
    expect(servidor.llamadasA('GET', '/tarjetas/t1/cargos')).toHaveLength(0);
  });

  it('"Registrar cargo" abre la hoja de esa tarjeta', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: 'Registrar cargo' })[0]!);

    expect(await screen.findByRole('dialog', { name: 'Registrar cargo' })).toBeInTheDocument();
  });

  it('corregir una compra pide confirmación y manda el borrado de ese cargo de esa tarjeta', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas/t1/cargos': [cargo('c1')], 'DELETE /tarjetas/t1/cargos/c1': undefined }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');
    await usuario.click(screen.getAllByRole('button', { name: /Ver compras/ })[0]!);
    await usuario.click(await screen.findByRole('button', { name: 'Corregir' }));

    expect(screen.getByText('¿Corregir este cargo?')).toBeInTheDocument();
    expect(servidor.llamadasA('DELETE', '/tarjetas/t1/cargos/c1')).toHaveLength(0); // todavía no
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    await waitFor(() => expect(servidor.llamadasA('DELETE', '/tarjetas/t1/cargos/c1')).toHaveLength(1));
  });
});

describe('Tarjetas — eliminar una tarjeta', () => {
  it('pide confirmación con el nombre de la tarjeta y "Cancelar" no borra nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar tarjeta' })[0]!);
    expect(screen.getByText('¿Eliminar la tarjeta "BBVA Oro"?')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/¿Eliminar la tarjeta/)).not.toBeInTheDocument();
    expect(servidor.peticiones().filter((p) => p.metodo === 'DELETE')).toHaveLength(0);
  });

  it('confirmada, borra esa tarjeta y vuelve a leer la lista', async () => {
    let tarjetas = [bbva, nu];
    servidor = instalarServidorFalso(apiFetch, rutas({ '/tarjetas': () => tarjetas, 'DELETE /tarjetas/t1': () => { tarjetas = [nu]; } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar tarjeta' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    await waitFor(() => expect(servidor.llamadasA('DELETE', '/tarjetas/t1')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('BBVA Oro')).not.toBeInTheDocument());
    expect(screen.getByText('Nu')).toBeInTheDocument();
  });

  it('si el servidor no deja eliminarla, lo dice junto a la tarjeta', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({ 'DELETE /tarjetas/t1': () => { throw new ApiError(409, 'TARJETA_CON_CARGOS_ACTIVOS', 'Corrige primero las compras de esta tarjeta'); } })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<Tarjetas />);
    await screen.findByText('BBVA Oro');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar tarjeta' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    expect(await screen.findByText('Corrige primero las compras de esta tarjeta')).toBeInTheDocument();
    expect(screen.getByText('BBVA Oro')).toBeInTheDocument();
  });
});
