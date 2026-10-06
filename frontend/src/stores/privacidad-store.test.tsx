import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BotonOcultarMontos } from '@/components/BotonOcultarMontos';
import { CifraDisponible } from '@/components/CifraDisponible';
import { MONTO_OCULTO, useFormatearMonto } from '@/hooks/use-formatear-monto';
import type { DisponibleOk } from '@/hooks/use-disponible';
import { usePrivacidadStore } from '@/stores/privacidad-store';

const pesos = (valorMinimo: number) => ({ valorMinimo, moneda: 'MXN' });

const disponible: DisponibleOk = {
  estado: 'ok',
  periodoId: 'p1',
  disponible: pesos(570000), // $5,700.00
  diasRestantes: 12,
  cifraDiaria: pesos(47500), // $475.00
  gastadoHoy: pesos(12000), // $120.00
  huboActividadHoy: true,
  calculadoEn: 'x',
};

beforeEach(() => {
  localStorage.clear();
  usePrivacidadStore.setState({ oculto: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('useFormatearMonto', () => {
  it('con los montos visibles formatea como siempre', () => {
    const { result } = renderHook(() => useFormatearMonto());

    expect(result.current(pesos(570000))).toBe('$5,700.00');
  });

  it('con el ojito activado enmascara cualquier monto, también el cero y los negativos', () => {
    usePrivacidadStore.setState({ oculto: true });
    const { result } = renderHook(() => useFormatearMonto());

    expect(result.current(pesos(570000))).toBe(MONTO_OCULTO);
    expect(result.current(pesos(0))).toBe(MONTO_OCULTO);
    expect(result.current(pesos(-1500))).toBe(MONTO_OCULTO);
    expect(MONTO_OCULTO).not.toMatch(/\d/);
  });

  it('al alternar, lo que ya estaba pintado cambia al instante', () => {
    const { result } = renderHook(() => useFormatearMonto());
    expect(result.current(pesos(570000))).toBe('$5,700.00');

    // Se suscribe al estado: el mismo hook, ya montado, devuelve una función nueva sin volver a montarse.
    act(() => usePrivacidadStore.getState().alternar());

    expect(result.current(pesos(570000))).toBe(MONTO_OCULTO);
  });
});

describe('BotonOcultarMontos', () => {
  it('alterna entre ocultar y mostrar, con su etiqueta y aria-pressed', async () => {
    const usuario = userEvent.setup();
    render(<BotonOcultarMontos />);

    const boton = screen.getByRole('button', { name: 'Ocultar montos' });
    expect(boton).toHaveAttribute('aria-pressed', 'false');

    await usuario.click(boton);
    expect(screen.getByRole('button', { name: 'Mostrar montos' })).toHaveAttribute('aria-pressed', 'true');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar montos' }));
    expect(screen.getByRole('button', { name: 'Ocultar montos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('recuerda la elección en el dispositivo', async () => {
    const usuario = userEvent.setup();
    render(<BotonOcultarMontos />);

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));
    expect(localStorage.getItem('korly:ocultar-montos')).toBe('1');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar montos' }));
    expect(localStorage.getItem('korly:ocultar-montos')).toBe('0');
  });
});

describe('estado inicial y almacenamiento', () => {
  it('por defecto los montos se ven', async () => {
    const { usePrivacidadStore: tienda } = await import('@/stores/privacidad-store');

    expect(tienda.getState().oculto).toBe(false);
  });

  it('si la elección guardada era ocultar, la app arranca con los montos ocultos', async () => {
    localStorage.setItem('korly:ocultar-montos', '1');
    vi.resetModules();

    const { usePrivacidadStore: tienda } = await import('@/stores/privacidad-store');

    expect(tienda.getState().oculto).toBe(true);
  });

  it('si el almacenamiento falla (ventana privada, datos bloqueados), la app sigue funcionando sin recordar', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.resetModules();

    const { usePrivacidadStore: tienda } = await import('@/stores/privacidad-store');
    expect(tienda.getState().oculto).toBe(false);
    expect(() => tienda.getState().alternar()).not.toThrow();
    expect(tienda.getState().oculto).toBe(true);
  });
});

describe('la tarjeta de la cifra (Inicio)', () => {
  it('con el ojito activado no deja ver ninguna cifra de dinero, pero sí los días restantes', () => {
    usePrivacidadStore.setState({ oculto: true });
    const { container } = render(<CifraDisponible disponible={disponible} />);

    expect(container.textContent).not.toMatch(/\$\s?\d/);
    expect(container.textContent).not.toContain('5,700');
    expect(container.textContent).not.toContain('475');
    expect(container.textContent).toContain('Ya gastaste');
    expect(container.textContent).toContain('12');
  });

  it('con los montos visibles muestra la cifra, el total y lo gastado hoy', () => {
    const { container } = render(<CifraDisponible disponible={disponible} />);

    expect(container.textContent).toContain('$475.00');
    expect(container.textContent).toContain('$5,700.00');
    expect(container.textContent).toContain('$120.00');
  });

  it('el ojito de la tarjeta oculta y vuelve a mostrar los montos', async () => {
    const usuario = userEvent.setup();
    const { container } = render(<CifraDisponible disponible={disponible} />);

    await usuario.click(screen.getByRole('button', { name: 'Ocultar montos' }));
    expect(container.textContent).not.toContain('$475.00');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar montos' }));
    expect(container.textContent).toContain('$475.00');
  });
});

describe('ninguna pantalla se salta el ojito', () => {
  const fuentes = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('ningún componente usa formatearMonto directo: todos pasan por useFormatearMonto', () => {
    const infractores = Object.entries(fuentes)
      .filter(([ruta]) => !ruta.includes('.test.'))
      .filter(([, codigo]) => /from '@\/lib\/dinero'/.test(codigo) && /\bformatearMonto\b/.test(codigo))
      .map(([ruta]) => ruta);

    expect(infractores, `Estos archivos muestran montos sin respetar el ojito de privacidad:\n${infractores.join('\n')}`).toEqual([]);
  });

  it('las pantallas con montos tienen el ojito a mano: Inicio (en la tarjeta) y el encabezado de las demás', () => {
    expect(fuentes['/src/components/CifraDisponible.tsx']).toContain('BotonOcultarMontos');
    expect(fuentes['/src/components/PageHeader.tsx']).toContain('BotonOcultarMontos');
  });
});
