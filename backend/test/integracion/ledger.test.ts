import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { asientos } from '../../src/db/schema/ledger.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCuenta, obtenerSaldoCuenta, registrarMovimiento } from '../../src/modulos/ledger/registrar-movimiento.js';
import { conTenant } from '../../src/shared/db.js';

/**
 * Prueba el motor genérico de partida doble (ADR-001) contra Postgres
 * real: el saldo es la suma de los asientos, un movimiento desbalanceado
 * o con monedas mezcladas lo rechaza un trigger de la base de datos (no
 * solo la validación de la aplicación), y ningún asiento se puede editar
 * ni borrar. Corre en CI igual que aislamiento-tenant.test.ts.
 */
describe('ledger (partida doble)', () => {
  async function tenantDePrueba() {
    const { tenantId } = await resolverOcrearIdentidad(`test-ledger-${randomUUID()}`);
    return tenantId;
  }

  it('el saldo de una cuenta es la suma de sus asientos', async () => {
    const tenantId = await tenantDePrueba();
    const cuenta = await crearCuenta(tenantId, 'periodo');

    await registrarMovimiento({
      tenantId,
      tipo: 'ingreso',
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      partidas: [
        { cuentaId: cuenta.id, montoValorMinimo: 500000n },
        { cuentaId: null, montoValorMinimo: -500000n },
      ],
    });

    await registrarMovimiento({
      tenantId,
      tipo: 'gasto',
      moneda: 'MXN',
      fechaEfectiva: '2026-08-02',
      partidas: [
        { cuentaId: cuenta.id, montoValorMinimo: -120000n },
        { cuentaId: null, montoValorMinimo: 120000n },
      ],
    });

    const saldo = await obtenerSaldoCuenta(tenantId, cuenta.id);
    expect(saldo).toBe(380000n);
  });

  it('la aplicación rechaza un movimiento desbalanceado antes de tocar la base', async () => {
    const tenantId = await tenantDePrueba();
    const cuenta = await crearCuenta(tenantId, 'periodo');

    await expect(
      registrarMovimiento({
        tenantId,
        tipo: 'ingreso',
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        partidas: [
          { cuentaId: cuenta.id, montoValorMinimo: 500000n },
          { cuentaId: null, montoValorMinimo: -499999n },
        ],
      })
    ).rejects.toThrow(/no suman cero/);
  });

  it('el trigger de la base de datos rechaza un movimiento desbalanceado aunque se salte la validación de la aplicación', async () => {
    const tenantId = await tenantDePrueba();
    const cuenta = await crearCuenta(tenantId, 'periodo');

    await expect(
      conTenant(tenantId, async (tx) => {
        const [movimiento] = await tx.execute<{ id: string }>(sql`
          insert into movimientos (tenant_id, tipo, moneda, fecha_efectiva)
          values (${tenantId}, 'ingreso', 'MXN', '2026-08-01')
          returning id
        `);
        if (!movimiento) throw new Error('setup falló');

        // Inserta un asiento sin su contraparte: nunca puede sumar cero.
        await tx.insert(asientos).values({
          tenantId,
          movimientoId: movimiento.id,
          cuentaId: cuenta.id,
          montoValorMinimo: 100n,
          moneda: 'MXN',
        });
      })
    ).rejects.toThrow(/no está balanceado/);
  });

  it('el trigger de la base de datos rechaza mezclar monedas en un mismo movimiento', async () => {
    const tenantId = await tenantDePrueba();
    const cuenta = await crearCuenta(tenantId, 'periodo');

    await expect(
      conTenant(tenantId, async (tx) => {
        const [movimiento] = await tx.execute<{ id: string }>(sql`
          insert into movimientos (tenant_id, tipo, moneda, fecha_efectiva)
          values (${tenantId}, 'ingreso', 'MXN', '2026-08-01')
          returning id
        `);
        if (!movimiento) throw new Error('setup falló');

        await tx.insert(asientos).values([
          { tenantId, movimientoId: movimiento.id, cuentaId: cuenta.id, montoValorMinimo: 100n, moneda: 'MXN' },
          { tenantId, movimientoId: movimiento.id, cuentaId: null, montoValorMinimo: -100n, moneda: 'USD' },
        ]);
      })
    ).rejects.toThrow(/mezcla más de una moneda/);
  });

  it('un asiento no se puede editar ni eliminar', async () => {
    const tenantId = await tenantDePrueba();
    const cuenta = await crearCuenta(tenantId, 'periodo');

    const { movimientoId } = await registrarMovimiento({
      tenantId,
      tipo: 'ingreso',
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      partidas: [
        { cuentaId: cuenta.id, montoValorMinimo: 1000n },
        { cuentaId: null, montoValorMinimo: -1000n },
      ],
    });

    // tx.execute() con SQL crudo envuelve el error del driver en
    // DrizzleQueryError ("Failed query: ...") y deja el mensaje real de
    // Postgres en `.cause` — por eso se revisa ahí y no en `.message`.
    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`update asientos set monto_valor_minimo = 2000 where movimiento_id = ${movimientoId}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });

    await expect(
      conTenant(tenantId, (tx) => tx.execute(sql`delete from asientos where movimiento_id = ${movimientoId}`))
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/inmutables/) } });
  });
});
