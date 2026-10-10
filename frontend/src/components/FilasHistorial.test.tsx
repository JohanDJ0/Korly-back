import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { FilaGasto } from '@/components/FilaGasto';
import { FilaIngreso } from '@/components/FilaIngreso';
import { formatearMonto } from '@/lib/dinero';
import { instalarServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const gasto = { id: 'g1', periodoId: 'p1', monto: pesos(50000), fechaEfectiva: '2026-10-09', fechaRegistro: '2026-10-09T12:00:00Z', revertido: false, esRecurrente: false };
const ingreso = { id: 'i1', periodoId: 'p1', monto: pesos(500000), fechaEfectiva: '2026-10-01', fechaRegistro: '2026-10-01T12:00:00Z', revertido: false };

describe('FilaGasto — confirmar la eliminación', () => {
  it('la pregunta dice de cuánto es el gasto, para no borrar el equivocado entre varios iguales o parecidos', async () => {
    instalarServidorFalso(apiFetch, { '/categorias': [] });
    const usuario = userEvent.setup();
    renderConProveedores(<ul><FilaGasto gasto={gasto} /></ul>);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(screen.getByText(`¿Eliminar este gasto de ${m(50000)}?`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('la fila se puede partir en renglones: la confirmación no se sale de la pantalla en el celular', () => {
    instalarServidorFalso(apiFetch, { '/categorias': [] });
    const { container } = renderConProveedores(<ul><FilaGasto gasto={gasto} /></ul>);

    expect(container.querySelector('li')).toHaveClass('flex-wrap');
    expect(screen.getByRole('button', { name: 'Eliminar' }).parentElement).toHaveClass('flex-wrap', 'max-w-full');
  });

  it('confirmar elimina; cancelar no toca nada', async () => {
    const servidor = instalarServidorFalso(apiFetch, { '/categorias': [], 'DELETE /gastos/g1': undefined });
    const usuario = userEvent.setup();
    renderConProveedores(<ul><FilaGasto gasto={gasto} /></ul>);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(servidor.llamadasA('DELETE', '/gastos/g1')).toHaveLength(0);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, confirmar' }));
    await waitFor(() => expect(servidor.llamadasA('DELETE', '/gastos/g1')).toHaveLength(1));
  });
});

describe('FilaIngreso — confirmar la eliminación', () => {
  it('la pregunta dice de cuánto es el ingreso', async () => {
    instalarServidorFalso(apiFetch, {});
    const usuario = userEvent.setup();
    renderConProveedores(<ul><FilaIngreso ingreso={ingreso} /></ul>);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(screen.getByText(`¿Eliminar este ingreso de ${m(500000)}?`)).toBeInTheDocument();
  });

  it('si es el único de la quincena, avisa que sin él no se puede calcular cuánto puedes gastar', async () => {
    instalarServidorFalso(apiFetch, {});
    const usuario = userEvent.setup();
    renderConProveedores(<ul><FilaIngreso ingreso={ingreso} esElUnico /></ul>);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(screen.getByText(/Es el único de la quincena: sin él no se puede calcular cuánto puedes gastar/)).toBeInTheDocument();
  });

  it('si hay más ingresos, no asusta con ese aviso', async () => {
    instalarServidorFalso(apiFetch, {});
    const usuario = userEvent.setup();
    renderConProveedores(<ul><FilaIngreso ingreso={ingreso} /></ul>);

    await usuario.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(screen.queryByText(/Es el único/)).not.toBeInTheDocument();
  });
});
