import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiFetch }));

import { DesglosePeriodo } from '@/components/DesglosePeriodo';
import type { Desglose } from '@/hooks/use-desglose';
import { formatearMonto } from '@/lib/dinero';
import { usePrivacidadStore } from '@/stores/privacidad-store';
import { instalarServidorFalso } from '@/test/servidor-falso';
import { pesos, renderConProveedores } from '@/test/utilidades';

const m = (valorMinimo: number) => formatearMonto(pesos(valorMinimo));

const base: Desglose = {
  periodoId: 'p1',
  fechaInicio: '2026-10-01',
  fechaFin: '2026-10-15',
  totalGastado: pesos(0),
  totalVariable: pesos(0),
  recurrentes: { total: pesos(0), items: [] },
  aportesAMetas: { total: pesos(0) },
  rubros: [],
  semanas: [],
  semanaMasCara: null,
};

beforeEach(() => {
  usePrivacidadStore.setState({ oculto: false });
});

function montar(desglose: Desglose) {
  instalarServidorFalso(apiFetch, { '/periodos/p1/desglose': desglose });
  return renderConProveedores(<DesglosePeriodo periodoId="p1" />);
}

describe('DesglosePeriodo — aportes a metas', () => {
  it('el ahorro en metas va en su propio bloque, y la suma del gastado lo incluye', async () => {
    montar({
      ...base,
      totalGastado: pesos(150000),
      totalVariable: pesos(100000),
      aportesAMetas: { total: pesos(50000) },
      rubros: [{ clave: 'sin_categoria', etiqueta: 'Sin categoría', tipo: 'sin_categoria', monto: pesos(100000) }],
      semanas: [{ numero: 1, fechaInicio: '2026-10-01', fechaFin: '2026-10-15', dias: 15, diasTranscurridos: 15, total: pesos(100000), promedioDiario: pesos(6666), rubros: [] }],
    });

    expect(await screen.findByText('APORTES A METAS')).toBeInTheDocument();
    expect(screen.getByText('Ahorrado esta quincena')).toBeInTheDocument();
    expect(screen.getByText(/aportes a metas \+/)).toHaveTextContent(`Gastado ${m(150000)} = ${m(50000)} aportes a metas + ${m(100000)} variable.`);
  });

  it('con recurrentes y aportes la cuenta los nombra a los dos', async () => {
    montar({
      ...base,
      totalGastado: pesos(180000),
      totalVariable: pesos(100000),
      recurrentes: { total: pesos(30000), items: [{ id: 'r1', descripcion: 'Netflix', frecuencia: 'mensual', diaMes: 5, monto: pesos(30000) }] },
      aportesAMetas: { total: pesos(50000) },
      rubros: [{ clave: 'sin_categoria', etiqueta: 'Sin categoría', tipo: 'sin_categoria', monto: pesos(100000) }],
      semanas: [{ numero: 1, fechaInicio: '2026-10-01', fechaFin: '2026-10-15', dias: 15, diasTranscurridos: 15, total: pesos(100000), promedioDiario: pesos(6666), rubros: [] }],
    });

    expect(await screen.findByText(/recurrentes \+/)).toHaveTextContent(`${m(30000)} recurrentes + ${m(50000)} aportes a metas + ${m(100000)} variable.`);
  });

  it('sin aportes no hay bloque de ahorro', async () => {
    montar({
      ...base,
      totalGastado: pesos(100000),
      totalVariable: pesos(100000),
      rubros: [{ clave: 'sin_categoria', etiqueta: 'Sin categoría', tipo: 'sin_categoria', monto: pesos(100000) }],
      semanas: [{ numero: 1, fechaInicio: '2026-10-01', fechaFin: '2026-10-15', dias: 15, diasTranscurridos: 15, total: pesos(100000), promedioDiario: pesos(6666), rubros: [] }],
    });

    await screen.findByText('GASTO VARIABLE POR CATEGORÍA');
    expect(screen.queryByText('APORTES A METAS')).not.toBeInTheDocument();
  });

  it('si todo lo gastado fue ahorro, lo dice en vez de mostrar un análisis vacío', async () => {
    montar({ ...base, totalGastado: pesos(50000), totalVariable: pesos(0), aportesAMetas: { total: pesos(50000) } });

    expect(await screen.findByText(/todo lo gastado fue recurrente o ahorro a metas/)).toBeInTheDocument();
  });

  it('con el ojito activado no se ve el monto ahorrado', async () => {
    usePrivacidadStore.setState({ oculto: true });
    montar({ ...base, totalGastado: pesos(50000), totalVariable: pesos(0), aportesAMetas: { total: pesos(50000) } });

    await screen.findByText('APORTES A METAS');
    expect(screen.queryByText(m(50000), { exact: false })).not.toBeInTheDocument();
  });
});
