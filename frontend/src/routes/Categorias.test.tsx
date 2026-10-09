import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import type { Categoria } from '@/hooks/use-categorias';
import { ApiError } from '@/lib/api';
import { Categorias } from '@/routes/Categorias';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { renderConProveedores } from '@/test/utilidades';

const comida: Categoria = { id: 'c1', nombre: 'Comida', esPredeterminada: true, icono: null };
const gym: Categoria = { id: 'c2', nombre: 'Gimnasio', esPredeterminada: false, icono: 'salud' };
const cafeteria: Categoria = { id: 'c3', nombre: 'Cafetería', esPredeterminada: false, icono: null };

function rutas(extra: Rutas = {}): Rutas {
  return { '/categorias': [comida, gym, cafeteria], ...extra };
}

let servidor: ServidorFalso;

beforeEach(() => {
  servidor = instalarServidorFalso(apiFetch, rutas());
});

describe('Categorías — la lista', () => {
  it('muestra todas; las predeterminadas dicen que lo son y no se pueden eliminar, las tuyas sí', async () => {
    renderConProveedores(<Categorias />);

    expect(await screen.findByText('Comida')).toBeInTheDocument();
    expect(screen.getByText('Gimnasio')).toBeInTheDocument();
    expect(screen.getByText('Cafetería')).toBeInTheDocument();
    expect(screen.getAllByText('Predeterminada')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2); // Gimnasio y Cafetería, no Comida
  });

  it('un error del servidor se muestra', async () => {
    servidor.poner({ '/categorias': () => { throw new ApiError(500, 'ERROR_INTERNO', 'No se pudieron leer tus categorías'); } });
    renderConProveedores(<Categorias />);

    expect(await screen.findByText('No se pudieron leer tus categorías')).toBeInTheDocument();
  });

  it('no tiene ojito de privacidad (no muestra montos)', async () => {
    renderConProveedores(<Categorias />);

    await screen.findByText('Comida');
    expect(screen.queryByRole('button', { name: /montos/ })).not.toBeInTheDocument();
  });
});

describe('Categorías — editar', () => {
  it('al tocar el nombre se edita; cambiarlo y pulsar "Listo" manda el nombre nuevo (sin espacios de más) y cierra la edición', async () => {
    servidor.poner({ 'PATCH /categorias/c3': cafeteria });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    const campo = screen.getByDisplayValue('Cafetería');
    await usuario.clear(campo);
    await usuario.type(campo, '  Perros y gatos  ');
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/categorias/c3')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/categorias/c3')[0]?.cuerpo).toEqual({ nombre: 'Perros y gatos' });
    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument();
  });

  it('con Enter también guarda', async () => {
    servidor.poner({ 'PATCH /categorias/c3': cafeteria });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    await usuario.type(screen.getByDisplayValue('Cafetería'), ' y más{Enter}');

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/categorias/c3')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/categorias/c3')[0]?.cuerpo).toEqual({ nombre: 'Cafetería y más' });
  });

  it('si el nombre no cambió, "Listo" cierra sin molestar al servidor', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument();
    expect(servidor.peticiones().filter((p) => p.metodo === 'PATCH')).toHaveLength(0);
  });

  it('un nombre vacío no se guarda: se explica y la edición sigue abierta', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    await usuario.clear(screen.getByDisplayValue('Cafetería'));
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.getByText('El nombre no puede estar vacío')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeInTheDocument();
    expect(servidor.peticiones().filter((p) => p.metodo === 'PATCH')).toHaveLength(0);
  });

  it('elegir un ícono lo guarda al instante, y el ícono de la categoría queda marcado', async () => {
    servidor.poner({ 'PATCH /categorias/c3': cafeteria });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    const renglon = screen.getByDisplayValue('Cafetería').closest('li') as HTMLElement;
    await usuario.click(within(renglon).getByRole('button', { name: 'Viajes' }));

    await waitFor(() => expect(servidor.llamadasA('PATCH', '/categorias/c3')).toHaveLength(1));
    expect(servidor.llamadasA('PATCH', '/categorias/c3')[0]?.cuerpo).toEqual({ icono: 'viajes' });
  });

  it('al editar una categoría con ícono, ese ícono aparece marcado', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Gimnasio' }));
    const renglon = screen.getByDisplayValue('Gimnasio').closest('li') as HTMLElement;

    expect(within(renglon).getByRole('button', { name: 'Salud' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(renglon).getByRole('button', { name: 'Viajes' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('si el servidor rechaza el cambio, muestra el motivo', async () => {
    servidor.poner({ 'PATCH /categorias/c3': () => { throw new ApiError(409, 'CATEGORIA_DUPLICADA', 'Ya existe una categoría con ese nombre'); } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);

    await usuario.click(await screen.findByRole('button', { name: 'Cafetería' }));
    await usuario.type(screen.getByDisplayValue('Cafetería'), ' 2');
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));

    expect(await screen.findByText('Ya existe una categoría con ese nombre')).toBeInTheDocument();
  });
});

describe('Categorías — eliminar', () => {
  it('pide confirmación con el nombre y "Cancelar" no borra nada', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Gimnasio');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);
    expect(screen.getByText('¿Eliminar la categoría "Gimnasio"?')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/¿Eliminar la categoría/)).not.toBeInTheDocument();
    expect(servidor.peticiones().filter((p) => p.metodo === 'DELETE')).toHaveLength(0);
  });

  it('confirmada, borra esa categoría y la lista se vuelve a leer', async () => {
    let categorias = [comida, gym, cafeteria];
    servidor.poner({ '/categorias': () => categorias, 'DELETE /categorias/c2': () => { categorias = [comida, cafeteria]; } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Gimnasio');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    await waitFor(() => expect(servidor.llamadasA('DELETE', '/categorias/c2')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Gimnasio')).not.toBeInTheDocument());
    expect(screen.getByText('Cafetería')).toBeInTheDocument();
  });

  it('si el servidor no deja eliminarla, lo dice junto a la categoría', async () => {
    servidor.poner({ 'DELETE /categorias/c2': () => { throw new ApiError(409, 'CATEGORIA_EN_USO', 'Esa categoría tiene gastos y no se puede eliminar'); } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Gimnasio');

    await usuario.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    expect(await screen.findByText('Esa categoría tiene gastos y no se puede eliminar')).toBeInTheDocument();
    expect(screen.getByText('Gimnasio')).toBeInTheDocument();
  });
});

describe('Categorías — crear una nueva', () => {
  const nueva = () => screen.getByPlaceholderText('Nombre de la categoría');

  it('sin nombre no se manda nada', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Comida');

    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));
    await usuario.type(nueva(), '   ');
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(servidor.llamadasA('POST', '/categorias')).toHaveLength(0);
  });

  it('con nombre e ícono los manda, y limpia el formulario al terminar', async () => {
    servidor.poner({ 'POST /categorias': { id: 'c9', nombre: 'Café', esPredeterminada: false, icono: 'comida' } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Comida');
    const zona = nueva().closest('div') as HTMLElement;

    await usuario.type(nueva(), '  Café  ');
    await usuario.click(within(zona).getByRole('button', { name: 'Comida' }));
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/categorias')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/categorias')[0]?.cuerpo).toEqual({ nombre: 'Café', icono: 'comida' });
    await waitFor(() => expect(nueva()).toHaveValue(''));
    expect(within(zona).getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sin elegir ícono no manda ícono (se empareja por el nombre)', async () => {
    servidor.poner({ 'POST /categorias': { id: 'c9', nombre: 'Café', esPredeterminada: false, icono: null } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Comida');

    await usuario.type(nueva(), 'Café');
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/categorias')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/categorias')[0]?.cuerpo).toEqual({ nombre: 'Café' });
  });

  it('con Enter en el nombre también la crea', async () => {
    servidor.poner({ 'POST /categorias': { id: 'c9', nombre: 'Café', esPredeterminada: false, icono: null } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Comida');

    await usuario.type(nueva(), 'Café{Enter}');

    await waitFor(() => expect(servidor.llamadasA('POST', '/categorias')).toHaveLength(1));
  });

  it('si el servidor la rechaza, muestra el motivo y conserva lo escrito', async () => {
    servidor.poner({ 'POST /categorias': () => { throw new ApiError(409, 'CATEGORIA_DUPLICADA', 'Ya existe una categoría con ese nombre'); } });
    const usuario = userEvent.setup();
    renderConProveedores(<Categorias />);
    await screen.findByText('Comida');

    await usuario.type(nueva(), 'Comida{Enter}');

    expect(await screen.findByText('Ya existe una categoría con ese nombre')).toBeInTheDocument();
    expect(nueva()).toHaveValue('Comida');
  });
});
