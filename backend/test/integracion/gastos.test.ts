import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { editarGasto, eliminarGasto, listarGastos, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { conTenant } from '../../src/shared/db.js';

describe('gastos', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-gastos-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

  const HOY_DE_PRUEBA = new Date('2026-08-01T00:00:00Z');

  it('registrar un gasto reduce el saldo de la cuenta del periodo', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 500000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: HOY_DE_PRUEBA,
    });

    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 120000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      fechaReferencia: HOY_DE_PRUEBA,
    });

    const saldo = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
    expect(saldo).toBe(380000n);
  });

  it('permite sobregiro: el saldo puede quedar negativo, sin bloquear el gasto', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    await registrarIngreso({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: HOY_DE_PRUEBA,
    });

    await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 5000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      fechaReferencia: HOY_DE_PRUEBA,
    });

    const saldo = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
    expect(saldo).toBe(-4000n);
  });

  it('rechaza un monto no positivo antes de tocar la base de datos', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();

    await expect(
      registrarGasto({ tenantId, periodoId: periodo.id, monto: 0n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY_DE_PRUEBA })
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });

  it('rechaza registrar contra un periodo en borrador', async () => {
    const { tenantId } = await tenantConPeriodoActivo();
    const segundo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    expect(segundo.estado).toBe('borrador');

    await expect(
      registrarGasto({ tenantId, periodoId: segundo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'PERIODO_NO_ACTIVO' });
  });

  it('rechaza el periodo activo de OTRO tenant como si no existiera (RLS, no un caso especial)', async () => {
    const { periodo: periodoDeB } = await tenantConPeriodoActivo();
    const { tenantId: tenantA } = await tenantConPeriodoActivo();

    await expect(
      registrarGasto({ tenantId: tenantA, periodoId: periodoDeB.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' })
    ).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('el gasto queda inmutable: no se puede editar ni eliminar', async () => {
    const { tenantId, periodo } = await tenantConPeriodoActivo();
    const { id: gastoId } = await registrarGasto({
      tenantId,
      periodoId: periodo.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: HOY_DE_PRUEBA,
    });

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`delete from gastos where id = ${gastoId}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
  });

  describe('eliminarGasto', () => {
    it('sobre un gasto del periodo activo: revierte sin tocar la fila, el saldo vuelve a como estaba', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 120000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarGasto({ tenantId, gastoId, fechaReferencia: new Date('2026-08-03T00:00:00Z') });

      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(500000n);
      // La fila original sigue existiendo (nunca hard delete).
      const [fila] = await conTenant(tenantId, (tx) => tx.execute(sql`select id from gastos where id = ${gastoId}`));
      expect(fila?.id).toBe(gastoId);
    });

    it('sobre un gasto de un periodo YA CERRADO: el saldo del periodo cerrado no cambia, el ajuste cae en el periodo activo actual', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 120000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      const saldoCerradoTrasCierre = await obtenerSaldoCuenta(tenantId, periodo.cuentaId);
      const siguiente = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));
      expect(siguiente.estado).toBe('activo');

      await eliminarGasto({ tenantId, gastoId, fechaReferencia: new Date('2026-08-17T00:00:00Z') });

      // Invariante 5: un periodo cerrado no cambia de saldo nunca.
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(saldoCerradoTrasCierre);
      // El gasto eliminado devuelve su monto al periodo activo de hoy.
      expect(await obtenerSaldoCuenta(tenantId, siguiente.cuentaId)).toBe(120000n);
    });

    it('rechaza un gastoId inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();

      await expect(eliminarGasto({ tenantId, gastoId: randomUUID() })).rejects.toMatchObject({ codigo: 'GASTO_NO_ENCONTRADO' });
    });

    it('rechaza eliminar el mismo gasto dos veces', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarGasto({ tenantId, gastoId, fechaReferencia: HOY_DE_PRUEBA });

      await expect(eliminarGasto({ tenantId, gastoId, fechaReferencia: HOY_DE_PRUEBA })).rejects.toMatchObject({
        codigo: 'GASTO_YA_REVERTIDO',
      });
    });

    it('rechaza corregir un gasto de periodo cerrado si no hay ningún periodo activo todavía', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: gastoId } = await registrarGasto({
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
        eliminarGasto({ tenantId, gastoId, fechaReferencia: new Date('2026-08-17T00:00:00Z') })
      ).rejects.toMatchObject({ codigo: 'SIN_PERIODO_ACTIVO' });
    });
  });

  describe('editarGasto', () => {
    it('sobre un gasto del periodo activo: el saldo refleja el monto nuevo, no la suma de ambos', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 120000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const resultado = await editarGasto({
        tenantId,
        gastoId,
        monto: 90000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-03T00:00:00Z'),
      });

      expect(resultado.ajusteGenerado).toBe(false);
      expect(resultado.periodoId).toBe(periodo.id);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(410000n); // 500000 - 90000
    });

    it('sobre un gasto de un periodo YA CERRADO: ajusteGenerado es true y el ajuste neto cae en el periodo activo actual', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 500000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 120000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      const siguiente = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));

      const resultado = await editarGasto({
        tenantId,
        gastoId,
        monto: 90000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-17T00:00:00Z'),
      });

      expect(resultado.ajusteGenerado).toBe(true);
      expect(resultado.periodoId).toBe(siguiente.id);
      // +120000 de reversión, -90000 del gasto corregido = +30000 neto.
      expect(await obtenerSaldoCuenta(tenantId, siguiente.cuentaId)).toBe(30000n);
    });

    it('rechaza un monto no positivo antes de tocar la base de datos', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      // La validación de monto ocurre antes de resolver el periodo activo,
      // así que ni siquiera hace falta fechaReferencia aquí para que se
      // rechace por VALIDACION en vez de por cualquier otra cosa.
      await expect(editarGasto({ tenantId, gastoId, monto: 0n, moneda: 'MXN' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });
  });

  describe('listarGastos', () => {
    it('un periodo sin gastos devuelve una lista vacía y sin siguiente cursor', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const resultado = await listarGastos(tenantId, periodo.id);
      expect(resultado).toEqual({ datos: [], siguienteCursor: null });
    });

    it('lista los gastos del periodo, más reciente primero, con el signo positivo (no el de la partida)', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const primero = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        nota: 'Super',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      const segundo = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 500n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const resultado = await listarGastos(tenantId, periodo.id, { fechaReferencia: HOY_DE_PRUEBA });

      expect(resultado.siguienteCursor).toBeNull();
      expect(resultado.datos.map((g) => g.id)).toEqual([segundo.id, primero.id]);
      expect(resultado.datos[1]).toMatchObject({ montoValorMinimo: 1000n, moneda: 'MXN', nota: 'Super' });
      expect(resultado.datos[0]?.montoValorMinimo).toBe(500n);
    });

    it('pagina con cursor: la segunda página continúa exactamente donde terminó la primera', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { id } = await registrarGasto({
          tenantId,
          periodoId: periodo.id,
          monto: BigInt(100 + i),
          moneda: 'MXN',
          fechaEfectiva: '2026-08-01',
          fechaReferencia: HOY_DE_PRUEBA,
        });
        ids.push(id);
      }
      const ordenEsperado = [...ids].reverse(); // más reciente primero

      const primeraPagina = await listarGastos(tenantId, periodo.id, { limite: 2, fechaReferencia: HOY_DE_PRUEBA });
      expect(primeraPagina.datos.map((g) => g.id)).toEqual(ordenEsperado.slice(0, 2));
      expect(primeraPagina.siguienteCursor).not.toBeNull();

      const segundaPagina = await listarGastos(tenantId, periodo.id, {
        limite: 2,
        cursor: primeraPagina.siguienteCursor!,
        fechaReferencia: HOY_DE_PRUEBA,
      });
      expect(segundaPagina.datos.map((g) => g.id)).toEqual(ordenEsperado.slice(2, 4));
      expect(segundaPagina.siguienteCursor).not.toBeNull();

      const terceraPagina = await listarGastos(tenantId, periodo.id, {
        limite: 2,
        cursor: segundaPagina.siguienteCursor!,
        fechaReferencia: HOY_DE_PRUEBA,
      });
      expect(terceraPagina.datos.map((g) => g.id)).toEqual(ordenEsperado.slice(4, 5));
      expect(terceraPagina.siguienteCursor).toBeNull();
    });

    it('rechaza un cursor inválido', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await expect(listarGastos(tenantId, periodo.id, { cursor: 'esto-no-es-un-cursor-valido' })).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
    });

    it('rechaza un periodoId inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(listarGastos(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
    });

    it('un gasto eliminado sigue apareciendo en la lista (nunca hard delete), aunque su efecto ya esté anulado', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const { id: gastoId } = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      await eliminarGasto({ tenantId, gastoId, fechaReferencia: HOY_DE_PRUEBA });

      const resultado = await listarGastos(tenantId, periodo.id, { fechaReferencia: HOY_DE_PRUEBA });
      expect(resultado.datos.map((g) => g.id)).toContain(gastoId);
    });
  });
});
