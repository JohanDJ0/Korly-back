import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { listarIngresos, registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { conTenant } from '../../src/shared/db.js';

describe('ingresos', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-ingresos-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

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
      });
      expect(lista[0]?.nota).toBeNull();
    });

    it('rechaza un periodoId inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(listarIngresos(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
    });
  });
});
