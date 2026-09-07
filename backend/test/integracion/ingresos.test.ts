import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { editarIngreso, eliminarIngreso, listarIngresos, registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { conTenant } from '../../src/shared/db.js';

describe('ingresos', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-ingresos-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

  const HOY_DE_PRUEBA = new Date('2026-08-01T00:00:00Z');

  it('registrar un ingreso aumenta el saldo de la cuenta del periodo', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();

    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 500000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const saldo = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
    expect(saldo).toBe(500000n);
  });

  it('rechaza un monto no positivo antes de tocar la base de datos', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();

    await expect(
      registrarIngreso({ tenantId, periodoId: periodo.id, monto: 0n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });

    await expect(
      registrarIngreso({ tenantId, periodoId: periodo.id, monto: -100n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });

  it('rechaza registrar contra un periodo en borrador', async () => {
    const { tenantId } = await tenantConPeriodoActivo(); // ya deja uno activo
    const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    expect(segundo.estado).toBe('borrador');

    await expect(
      registrarIngreso({ tenantId, periodoId: segundo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'PERIODO_NO_ACTIVO' });
  });

  it('rechaza un periodoId inexistente', async () => {
    const { tenantId } = await tenantConPeriodoActivo();

    await expect(
      registrarIngreso({ tenantId, periodoId: randomUUID(), monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('rechaza el periodo activo de OTRO tenant como si no existiera (RLS, no un caso especial)', async () => {
    const { periodo: periodoDeB } = await tenantConPeriodoActivo();
    const { tenantId: tenantA } = await tenantConPeriodoActivo();

    await expect(
      registrarIngreso({ tenantId: tenantA, periodoId: periodoDeB.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('el ingreso queda inmutable: no se puede editar ni eliminar', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    const { id: ingresoId } = await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`delete from ingresos where id = ${ingresoId}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
  });

  describe('eliminarIngreso', () => {
    it('sobre un ingreso del periodo activo: revierte sin tocar la fila, el saldo vuelve a como estaba', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarIngreso({ tenantId, ingresoId, fechaReferencia: new Date('2026-08-02T00:00:00Z') });

      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(0n);
      // La fila original sigue existiendo (nunca hard delete).
      const [fila] = await conTenant(tenantId, (tx) => tx.execute(sql`select id from ingresos where id = ${ingresoId}`));
      expect(fila?.id).toBe(ingresoId);
    });

    it('sobre un ingreso de un periodo YA CERRADO: el saldo del periodo cerrado no cambia, el ajuste cae en el periodo activo actual', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      const saldoCerradoTrasCierre = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
      const siguiente = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));
      expect(siguiente.estado).toBe('activo');

      await eliminarIngreso({ tenantId, ingresoId, fechaReferencia: new Date('2026-08-17T00:00:00Z') });

      // Invariante 5: un periodo cerrado no cambia de saldo nunca.
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(saldoCerradoTrasCierre);
      // El ingreso eliminado resta su monto del periodo activo de hoy.
      expect(await obtenerSaldoCuenta(tenantId, siguiente.cuentaId)).toBe(-500000n);
    });

    it('rechaza un ingresoId inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();

      await expect(eliminarIngreso({ tenantId, ingresoId: randomUUID() })).rejects.toMatchObject({
        codigo: 'INGRESO_NO_ENCONTRADO',
      });
    });

    it('rechaza eliminar el mismo ingreso dos veces', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarIngreso({ tenantId, ingresoId, fechaReferencia: HOY_DE_PRUEBA });

      await expect(eliminarIngreso({ tenantId, ingresoId, fechaReferencia: HOY_DE_PRUEBA })).rejects.toMatchObject({
        codigo: 'INGRESO_YA_REVERTIDO',
      });
    });

    it('rechaza corregir un ingreso de periodo cerrado si no hay ningún periodo activo todavía', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      // A propósito: nadie llamó crearPeriodo todavía, así que no hay activo.

      await expect(
        eliminarIngreso({ tenantId, ingresoId, fechaReferencia: new Date('2026-08-17T00:00:00Z') })
      ).rejects.toMatchObject({ codigo: 'SIN_PERIODO_ACTIVO' });
    });
  });

  describe('editarIngreso', () => {
    it('sobre un ingreso del periodo activo: el saldo refleja el monto nuevo, no la suma de ambos', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const resultado = await editarIngreso({
        tenantId,
        ingresoId,
        monto: 450000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-02T00:00:00Z'),
      });

      expect(resultado.ajusteGenerado).toBe(false);
      expect(resultado.periodoId).toBe(periodo.id);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(450000n);
    });

    it('sobre un ingreso de un periodo YA CERRADO: ajusteGenerado es true y el ajuste neto cae en el periodo activo actual', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      const siguiente = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));

      const resultado = await editarIngreso({
        tenantId,
        ingresoId,
        monto: 450000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-17T00:00:00Z'),
      });

      expect(resultado.ajusteGenerado).toBe(true);
      expect(resultado.periodoId).toBe(siguiente.id);
      // -500000 de reversión, +450000 del ingreso corregido = -50000 neto.
      expect(await obtenerSaldoCuenta(tenantId, siguiente.cuentaId)).toBe(-50000n);
    });

    it('rechaza un monto no positivo antes de tocar la base de datos', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await expect(editarIngreso({ tenantId, ingresoId, monto: 0n, moneda: 'MXN' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });
  });

  describe('listarIngresos', () => {
    it('un periodo sin ingresos devuelve una lista vacía', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      expect(await listarIngresos(tenantId, periodo.id)).toEqual([]);
    });

    it('lista los ingresos del periodo, más reciente primero', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const primero = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        nota: 'Quincena',
        fechaReferencia: new Date('2026-08-01T00:00:00Z'),
      });
      const segundo = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        fechaReferencia: new Date('2026-08-03T00:00:00Z'),
      });

      const lista = await listarIngresos(tenantId, periodo.id, new Date('2026-08-03T00:00:00Z'));

      expect(lista.map((i) => i.id)).toEqual([segundo.id, primero.id]);
      expect(lista[1]).toMatchObject({
        periodoId: periodo.id,
        montoValorMinimo: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        nota: 'Quincena',
        revertido: false,
      });
      expect(lista[0]?.nota).toBeNull();
    });

    it('rechaza un periodoId inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(listarIngresos(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
    });

    it('un ingreso eliminado sigue apareciendo en la lista (nunca hard delete), marcado como revertido', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarIngreso({ tenantId, ingresoId, fechaReferencia: HOY_DE_PRUEBA });

      const lista = await listarIngresos(tenantId, periodo.id, HOY_DE_PRUEBA);
      expect(lista.find((i) => i.id === ingresoId)).toMatchObject({ revertido: true });
    });

    it('al editar un ingreso, la fila original queda revertido: true y la nueva revertido: false', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: ingresoId } = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const editado = await editarIngreso({ tenantId, ingresoId, monto: 800n, moneda: 'MXN', fechaReferencia: HOY_DE_PRUEBA });

      const lista = await listarIngresos(tenantId, periodo.id, HOY_DE_PRUEBA);
      const original = lista.find((i) => i.id === ingresoId);
      const nuevo = lista.find((i) => i.id === editado.id);
      expect(original).toMatchObject({ revertido: true });
      expect(nuevo).toMatchObject({ revertido: false, montoValorMinimo: 800n });
    });
  });
});
