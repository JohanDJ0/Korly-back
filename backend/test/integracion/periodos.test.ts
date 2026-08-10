import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearPeriodo, obtenerPeriodoActivo } from '../../src/modulos/periodos/crear-periodo.js';

describe('periodos (estados e invariante de un solo activo)', () => {
  async function tenantDePrueba() {
    const { tenantId } = await resolverOcrearIdentidad(`test-periodos-${randomUUID()}`);
    return tenantId;
  }

  it('el primer periodo de un tenant se crea activo', async () => {
    const tenantId = await tenantDePrueba();

    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    expect(periodo.estado).toBe('activo');
    expect(periodo.fechaInicio).toBe('2026-08-01');
    expect(periodo.fechaFin).toBe('2026-08-15');

    const activo = await obtenerPeriodoActivo(tenantId);
    expect(activo?.id).toBe(periodo.id);
  });

  it('un segundo periodo mientras uno sigue activo se crea en borrador, no lo reemplaza', async () => {
    const tenantId = await tenantDePrueba();

    const primero = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    expect(primero.estado).toBe('activo');
    expect(segundo.estado).toBe('borrador');

    const activo = await obtenerPeriodoActivo(tenantId);
    expect(activo?.id).toBe(primero.id);
  });

  it('dos "crear periodo" concurrentes del mismo tenant nunca dejan dos activos', async () => {
    const tenantId = await tenantDePrueba();

    const [a, b] = await Promise.all([
      crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z')),
      crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z')),
    ]);

    const estados = [a.estado, b.estado].sort();
    expect(estados).toEqual(['activo', 'borrador']);
  });

  it('sin ningún periodo, obtenerPeriodoActivo devuelve null', async () => {
    const tenantId = await tenantDePrueba();
    expect(await obtenerPeriodoActivo(tenantId)).toBeNull();
  });

  it('rechaza tipos de periodo no soportados todavía', async () => {
    const tenantId = await tenantDePrueba();
    // @ts-expect-error -- 'mensual' no es un TipoPeriodoSoportado; se
    // fuerza el tipo para probar el guard en runtime.
    await expect(crearPeriodo(tenantId, 'mensual')).rejects.toThrow(/no soportado/);
  });
});
