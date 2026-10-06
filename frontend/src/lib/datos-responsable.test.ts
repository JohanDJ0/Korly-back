import { afterEach, describe, expect, it, vi } from 'vitest';

import { PENDIENTE, valorDeEntorno } from '@/lib/datos-responsable';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('valorDeEntorno', () => {
  it('una variable vacía, solo con espacios o ausente es PENDIENTE; una con texto se usa sin espacios sobrantes', () => {
    expect(valorDeEntorno(undefined)).toBe(PENDIENTE);
    expect(valorDeEntorno('')).toBe(PENDIENTE);
    expect(valorDeEntorno('   ')).toBe(PENDIENTE);
    expect(valorDeEntorno('  Ana Pérez  ')).toBe('Ana Pérez');
  });
});

describe('RESPONSABLE (datos del responsable, fuera del código por ser el repositorio público)', () => {
  it('sin variables de entorno todo es PENDIENTE y se marca como pendiente', async () => {
    const modulo = await import('@/lib/datos-responsable');

    expect(modulo.RESPONSABLE.nombre).toBe(PENDIENTE);
    expect(modulo.RESPONSABLE.domicilio).toBe(PENDIENTE);
    expect(modulo.RESPONSABLE.jurisdiccion).toBe(PENDIENTE);
    expect(modulo.hayDatosPendientes).toBe(true);
  });

  it('con las tres variables, se leen de ahí y ya no hay datos pendientes', async () => {
    vi.stubEnv('VITE_RESPONSABLE_NOMBRE', 'Nombre de Prueba');
    vi.stubEnv('VITE_RESPONSABLE_DOMICILIO', 'Calle Falsa 123, Ciudad');
    vi.stubEnv('VITE_RESPONSABLE_JURISDICCION', 'Ciudad, Estado');
    vi.resetModules();

    const modulo = await import('@/lib/datos-responsable');

    expect(modulo.RESPONSABLE).toMatchObject({ nombre: 'Nombre de Prueba', domicilio: 'Calle Falsa 123, Ciudad', jurisdiccion: 'Ciudad, Estado' });
    expect(modulo.hayDatosPendientes).toBe(false);
  });

  it('con solo una variable puesta sigue habiendo datos pendientes: falta lo demás', async () => {
    vi.stubEnv('VITE_RESPONSABLE_NOMBRE', 'Nombre de Prueba');
    vi.resetModules();

    const modulo = await import('@/lib/datos-responsable');

    expect(modulo.RESPONSABLE.nombre).toBe('Nombre de Prueba');
    expect(modulo.hayDatosPendientes).toBe(true);
  });
});
