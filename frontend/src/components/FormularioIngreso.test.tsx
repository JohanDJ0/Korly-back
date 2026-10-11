import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { FormularioIngreso } from '@/components/FormularioIngreso';
import { instalarServidorFalso } from '@/test/servidor-falso';
import { renderConProveedores } from '@/test/utilidades';

const periodo = { id: 'p1', cuentaId: 'c1', estado: 'activo', fechaInicio: '2026-10-01', fechaFin: '2026-10-15', creadoEn: '2026-10-01T12:00:00Z' };

describe('FormularioIngreso — quien empieza a mitad de quincena', () => {
  it('el primer ingreso pregunta por el dinero que se tiene, no por el pago (la tarjeta que lo contiene explica lo de la mitad de quincena)', () => {
    instalarServidorFalso(apiFetch, { '/periodos/activo': periodo });
    renderConProveedores(<FormularioIngreso periodoId="p1" primerIngreso />);

    expect(screen.getByLabelText('¿Cuánto dinero tienes para esta quincena?')).toBeInTheDocument();
    expect(screen.queryByLabelText('¿Cuánto recibiste?')).not.toBeInTheDocument();
  });

  it('un ingreso adicional (bono, dinero extra) sigue preguntando cuánto se recibió, con su etiqueta de siempre', () => {
    instalarServidorFalso(apiFetch, { '/periodos/activo': periodo });
    renderConProveedores(<FormularioIngreso periodoId="p1" />);

    expect(screen.getByLabelText('¿Cuánto recibiste?')).toBeInTheDocument();
  });
});
