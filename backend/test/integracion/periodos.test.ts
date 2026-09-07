import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { crearPeriodo, listarPeriodos, obtenerPeriodoActivo } from '../../src/modulos/periodos/crear-periodo.js';

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

    // Misma fecha de referencia que crearPeriodo: obtenerPeriodoActivo
    // también resuelve el cierre perezoso (ver crear-periodo.ts), así
    // que con la fecha real de HOY (bien pasado el 15 de agosto de
    // 2026) cerraría este periodo de prueba antes de la aserción.
    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-01T00:00:00Z'));
    expect(activo?.id).toBe(periodo.id);
  });

  it('un segundo periodo mientras uno sigue activo se crea en borrador, no lo reemplaza', async () => {
    const tenantId = await tenantDePrueba();

    const primero = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    expect(primero.estado).toBe('activo');
    expect(segundo.estado).toBe('borrador');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-01T00:00:00Z'));
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

  describe('listarPeriodos', () => {
    it('sin ningún periodo, devuelve una lista vacía', async () => {
      const tenantId = await tenantDePrueba();
      expect(await listarPeriodos(tenantId)).toEqual([]);
    });

    it('lista todos los periodos del tenant, más reciente primero, incluidos los borradores', async () => {
      const tenantId = await tenantDePrueba();
      const primero = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z')); // borrador

      const resultado = await listarPeriodos(tenantId, new Date('2026-08-01T00:00:00Z'));

      expect(resultado.map((p) => p.id)).toEqual([segundo.id, primero.id]);
      expect(resultado.find((p) => p.id === segundo.id)?.estado).toBe('borrador');
    });

    it('un periodo cerrado sigue apareciendo, con su estado actualizado', async () => {
      const tenantId = await tenantDePrueba();
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: new Date('2026-08-01T00:00:00Z'),
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

      const resultado = await listarPeriodos(tenantId, new Date('2026-08-10T00:00:00Z'));

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject({ id: periodo.id, estado: 'cerrado' });
    });
  });
});
