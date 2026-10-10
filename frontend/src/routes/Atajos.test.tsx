import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { Atajo } from '@/hooks/use-atajos';
import { ApiError } from '@/lib/api';
import { formatearMonto } from '@/lib/dinero';
import { Atajos } from '@/routes/Atajos';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const cafe: Atajo = { id: 'a1', nombre: 'Café', monto: pesos(5500), categoriaId: 'c1' };
const camion: Atajo = { id: 'a2', nombre: 'Camión', monto: pesos(1800), categoriaId: null };
const categorias = [{ id: 'c1', nombre: 'Cafetería', esPredeterminada: false, icono: null }];

function rutas(extra: Rutas = {}): Rutas {
  return { '/atajos-gasto': { atajos: [cafe, camion], limite: 3 }, '/categorias': categorias, ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

/** Hay dos botones "Nuevo atajo" (encabezado de escritorio y pie de móvil); la pantalla decide cuál se ve con CSS. */
const botonesNuevo = () => screen.getAllByRole('button', { name: /Nuevo atajo/ });

describe('Atajos — la lista', () => {
  it('muestra cada atajo con su monto y su categoría, y cuántos lleva del límite', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Atajos />);

    expect(await screen.findByText(`${m(5500)} — Cafetería`)).toBeInTheDocument();
    expect(screen.getByText('Camión')).toBeInTheDocument();
    expect(screen.getByText(m(1800))).toBeInTheDocument();
    expect(screen.getByText(/Llevas 2 de 3/)).toBeInTheDocument();
  });

  it('sin atajos lo dice y ofrece crear el primero', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/atajos-gasto': { atajos: [], limite: 3 } }));
    renderConProveedores(<Atajos />);

    expect(await screen.findByText(/Todavía no tienes ningún atajo/)).toBeInTheDocument();
    expect(botonesNuevo()[0]).toBeEnabled();
  });

  it('al llegar al límite del plan apaga "Nuevo atajo" y explica por qué', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ '/atajos-gasto': { atajos: [cafe, camion, { ...cafe, id: 'a3', nombre: 'Comida' }], limite: 3 } }));
    renderConProveedores(<Atajos />);

    expect(await screen.findByText(/Llegaste al límite de atajos de tu plan/)).toBeInTheDocument();
    for (const boton of botonesNuevo()) expect(boton).toBeDisabled();
  });

  it('con el ojito activado no se ve ningún monto', async () => {
    usePrivacidadStore.setState({ oculto: true });
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<Atajos />);

    await screen.findByText('Café');
    expect(screen.queryByText(m(5500), { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(m(1800))).not.toBeInTheDocument();
  });

  it('un error del servidor se muestra, no una pantalla vacía', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        '/atajos-gasto': () => {
          throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus atajos');
        },
      })
    );
    renderConProveedores(<Atajos />);

    expect(await screen.findByText('No se pudieron leer tus atajos')).toBeInTheDocument();
  });
});

describe('Atajos — crear', () => {
  it('manda nombre y monto en centavos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'POST /atajos-gasto': { id: 'a9', nombre: 'Tortillas', monto: pesos(2500), categoriaId: null } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);
    await screen.findByText('Café');

    await usuario.click(botonesNuevo()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo atajo' });
    await usuario.type(within(hoja).getByLabelText('Nombre'), 'Tortillas');
    await usuario.type(within(hoja).getByLabelText('Monto'), '25');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/atajos-gasto')[0]?.cuerpo).toEqual({ nombre: 'Tortillas', monto: { valorMinimo: 2500, moneda: 'MXN' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('valida el nombre y el monto antes de llamar al servidor', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);
    await screen.findByText('Café');

    await usuario.click(botonesNuevo()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo atajo' });
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText(/Ponle un nombre/)).toBeInTheDocument();
    expect(within(hoja).getByText('El monto debe ser mayor a cero')).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(0);
  });

  it('muestra el rechazo del servidor (nombre repetido, límite) sin cerrar la hoja', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        'POST /atajos-gasto': () => {
          throw new ApiError(400, 'VALIDACION', 'Ya tienes un atajo llamado "Café"');
        },
      })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);
    await screen.findByText('Camión');

    await usuario.click(botonesNuevo()[0]!);
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo atajo' });
    await usuario.type(within(hoja).getByLabelText('Nombre'), 'Café');
    await usuario.type(within(hoja).getByLabelText('Monto'), '55');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(await within(hoja).findByText('Ya tienes un atajo llamado "Café"')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nuevo atajo' })).toBeInTheDocument();
  });
});

describe('Atajos — editar y eliminar', () => {
  it('editar trae los valores puestos y manda el cambio por PATCH, conservando la categoría', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'PATCH /atajos-gasto/a1': { ...cafe, monto: pesos(6000) } }));
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar Café' }));
    const hoja = await screen.findByRole('dialog', { name: 'Editar atajo' });
    expect(within(hoja).getByLabelText('Nombre')).toHaveValue('Café');
    expect(within(hoja).getByLabelText('Monto')).toHaveValue(55);

    await usuario.clear(within(hoja).getByLabelText('Monto'));
    await usuario.type(within(hoja).getByLabelText('Monto'), '60');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/atajos-gasto/a1')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/atajos-gasto/a1')[0]?.cuerpo).toEqual({ nombre: 'Café', monto: { valorMinimo: 6000, moneda: 'MXN' }, categoriaId: 'c1' });
  });

  it('eliminar pide confirmar y luego borra el atajo', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas({ 'DELETE /atajos-gasto/a2': undefined }));
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);
    await screen.findByText('Camión');

    const fila = screen.getByText('Camión').closest('li')!;
    await usuario.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    expect(servidor.llamadasA('DELETE', '/atajos-gasto/a2')).toHaveLength(0); // todavía no: falta confirmar
    await usuario.click(within(fila).getByRole('button', { name: 'Sí, confirmar' }));

    await waitFor(() => expect(servidor.llamadasA('DELETE', '/atajos-gasto/a2')).toHaveLength(1));
  });

  it('cancelar la confirmación no borra nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<Atajos />);
    await screen.findByText('Camión');

    const fila = screen.getByText('Camión').closest('li')!;
    await usuario.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    await usuario.click(within(fila).getByRole('button', { name: 'Cancelar' }));

    expect(servidor.llamadasA('DELETE', '/atajos-gasto/a2')).toHaveLength(0);
    expect(within(fila).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });
});
