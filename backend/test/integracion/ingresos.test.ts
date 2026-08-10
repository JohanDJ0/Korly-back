import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
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
    });

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`delete from ingresos where id = ${ingresoId}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
  });
});
