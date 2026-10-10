import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { FormularioGasto } from '@/components/FormularioGasto';
import { GuardarComoAtajo } from '@/components/GuardarComoAtajo';
import { ApiError } from '@/lib/api';
import { instalarServidorFalso, type Rutas, type ServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

let servidor: ServidorFalso;

function rutas(extra: Rutas = {}): Rutas {
  return {
    '/periodos/activo/disponible': { estado: 'ok', periodoId: 'p1', disponible: pesos(570000), diasRestantes: 12, cifraDiaria: pesos(47500), gastadoHoy: pesos(0), huboActividadHoy: false, calculadoEn: 'x' },
    '/categorias': [{ id: 'c-comida', nombre: 'Comida', esPredeterminada: true, icono: 'comida' }],
    'POST /atajos-gasto': { id: 'a1', nombre: 'Café', monto: pesos(5500), categoriaId: null },
    'POST /periodos/p1/gastos': { id: 'g1', movimientoId: 'm1', periodoId: 'p1' },
    ...extra,
  };
}

describe('GuardarComoAtajo', () => {
  it('pide solo el nombre y guarda el monto y la categoría que ya estaban puestos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<GuardarComoAtajo monto={55} categoriaId="c-comida" nombreSugerido="Café" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    expect(screen.getByLabelText('Nombre del atajo')).toHaveValue('Café');
    await usuario.click(screen.getByRole('button', { name: 'Guardar atajo' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/atajos-gasto')[0]?.cuerpo).toEqual({ nombre: 'Café', monto: { valorMinimo: 5500, moneda: 'MXN' }, categoriaId: 'c-comida' });
    expect(await screen.findByRole('status')).toHaveTextContent('Atajo “Café” guardado');
  });

  it('un monto con centavos se convierte sin errores de redondeo', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<GuardarComoAtajo monto={19.99} categoriaId="" nombreSugerido="Antojo" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    await usuario.click(screen.getByRole('button', { name: 'Guardar atajo' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/atajos-gasto')[0]?.cuerpo).toEqual({ nombre: 'Antojo', monto: { valorMinimo: 1999, moneda: 'MXN' } });
  });

  it('sin nombre no deja guardar', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<GuardarComoAtajo monto={55} categoriaId="" nombreSugerido="" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));

    expect(screen.getByRole('button', { name: 'Guardar atajo' })).toBeDisabled();
  });

  it('Cancelar cierra el cuadro sin guardar nada', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<GuardarComoAtajo monto={55} categoriaId="" nombreSugerido="Café" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Guardar como atajo' })).toBeInTheDocument();
    expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(0);
  });

  it('si el servidor lo rechaza (límite del plan, nombre repetido), muestra su mensaje y deja intentar de nuevo', async () => {
    servidor = instalarServidorFalso(
      apiFetch,
      rutas({
        'POST /atajos-gasto': () => {
          throw new ApiError(403, 'LIMITE_ATAJOS_ALCANZADO', 'Alcanzaste el límite de 3 atajos de tu plan gratuito');
        },
      })
    );
    const usuario = userEvent.setup();
    renderConProveedores(<GuardarComoAtajo monto={55} categoriaId="" nombreSugerido="Café" />);

    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    await usuario.click(screen.getByRole('button', { name: 'Guardar atajo' }));

    expect(await screen.findByText('Alcanzaste el límite de 3 atajos de tu plan gratuito')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar atajo' })).toBeEnabled();
  });
});

describe('FormularioGasto — con atajos', () => {
  it('ofrece "Guardar como atajo" solo cuando ya hay un monto, y guardarlo no registra el gasto', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);

    expect(screen.queryByRole('button', { name: 'Guardar como atajo' })).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '55');
    await usuario.type(screen.getByLabelText(/Nota/i), 'Café');
    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    expect(screen.getByLabelText('Nombre del atajo')).toHaveValue('Café'); // propone la nota
    await usuario.click(screen.getByRole('button', { name: 'Guardar atajo' }));

    await waitFor(() => expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos/p1/gastos')).toHaveLength(0);
  });

  it('Enter en el nombre del atajo guarda el atajo y no registra el gasto', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    const usuario = userEvent.setup();
    renderConProveedores(<FormularioGasto periodoId="p1" />);

    await usuario.type(screen.getByLabelText('¿Cuánto gastaste?'), '30');
    await usuario.click(screen.getByRole('button', { name: 'Guardar como atajo' }));
    await usuario.type(screen.getByLabelText('Nombre del atajo'), 'Camión{Enter}');

    await waitFor(() => expect(servidor.llamadasA('POST', '/atajos-gasto')).toHaveLength(1));
    expect(servidor.llamadasA('POST', '/periodos/p1/gastos')).toHaveLength(0);
  });

  it('un formulario abierto desde un atajo trae el monto, la nota y la categoría puestos', async () => {
    servidor = instalarServidorFalso(apiFetch, rutas());
    renderConProveedores(<FormularioGasto periodoId="p1" inicial={{ monto: 6000, categoriaId: 'c-comida', nota: 'Laptop' }} />);

    expect(screen.getByLabelText('¿Cuánto gastaste?')).toHaveValue(6000);
    expect(screen.getByLabelText(/Nota/i)).toHaveValue('Laptop');
    expect(await screen.findByRole('button', { name: /Comida/ })).toHaveClass('bg-primary'); // la categoría ya está elegida
  });
});
