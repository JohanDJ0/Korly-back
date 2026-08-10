import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants } from '../../src/db/schema/tenants.js';
import { usuarios } from '../../src/db/schema/identidad.js';
import { asientos, cuentas, movimientos } from '../../src/db/schema/ledger.js';
import { periodos } from '../../src/db/schema/periodos.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCuenta, registrarMovimiento } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { conTenant, db } from '../../src/shared/db.js';

/**
 * Regla derivada de ADR-005: "debe existir un test que verifique que un
 * tenant no puede leer datos de otro, ejecutado en CI".
 *
 * Corre contra una base de datos real (ver .github/workflows/backend-ci.yml,
 * que levanta Postgres como servicio) conectada con el rol `app_backend`
 * — el mismo rol sin BYPASSRLS que usa el servidor en producción. Si estas
 * pruebas corrieran con el rol `postgres` de las migraciones, pasarían
 * aunque RLS estuviera roto o mal configurado, porque ese rol se salta las
 * políticas: no demostrarían nada.
 *
 * Inserta filas reales; pensado para una base de datos desechable de
 * prueba/CI, no para un proyecto Supabase compartido.
 */
describe('aislamiento por tenant (RLS)', () => {
  it('la conexión de la app corre con el rol sin privilegios (no con el de migraciones)', async () => {
    const [fila] = await db.execute<{ rol_actual: string }>(sql`select current_user as rol_actual`);
    expect(fila?.rol_actual).toBe('app_backend');
  });

  it('un tenant no puede leer el usuario de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-b-${randomUUID()}`);

    const filasVistasPorA = await conTenant(identidadA.tenantId, (tx) =>
      tx.select().from(usuarios).where(eq(usuarios.tenantId, identidadB.tenantId))
    );

    expect(filasVistasPorA).toHaveLength(0);
  });

  it('un tenant sí puede leer su propio usuario', async () => {
    const identidad = await resolverOcrearIdentidad(`test-aislamiento-propio-${randomUUID()}`);

    const filas = await conTenant(identidad.tenantId, (tx) => tx.select().from(usuarios));

    expect(filas).toHaveLength(1);
    expect(filas[0]?.id).toBe(identidad.usuarioId);
  });

  it('un tenant no puede leer la fila de "tenants" de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-tenants-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-tenants-b-${randomUUID()}`);

    const filas = await conTenant(identidadA.tenantId, (tx) =>
      tx.select().from(tenants).where(eq(tenants.id, identidadB.tenantId))
    );

    expect(filas).toHaveLength(0);
  });

  it('un tenant no puede leer las cuentas, movimientos ni asientos de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-ledger-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-ledger-b-${randomUUID()}`);

    const cuentaB = await crearCuenta(identidadB.tenantId, 'periodo');
    const { movimientoId: movimientoIdB } = await registrarMovimiento({
      tenantId: identidadB.tenantId,
      tipo: 'ingreso',
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      partidas: [
        { cuentaId: cuentaB.id, montoValorMinimo: 1000n },
        { cuentaId: null, montoValorMinimo: -1000n },
      ],
    });

    const [cuentasVistas, movimientosVistos, asientosVistos] = await conTenant(identidadA.tenantId, (tx) =>
      Promise.all([
        tx.select().from(cuentas).where(eq(cuentas.tenantId, identidadB.tenantId)),
        tx.select().from(movimientos).where(eq(movimientos.id, movimientoIdB)),
        tx.select().from(asientos).where(eq(asientos.tenantId, identidadB.tenantId)),
      ])
    );

    expect(cuentasVistas).toHaveLength(0);
    expect(movimientosVistos).toHaveLength(0);
    expect(asientosVistos).toHaveLength(0);
  });

  it('un tenant no puede leer el periodo de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-periodos-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-periodos-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    const filas = await conTenant(identidadA.tenantId, (tx) => tx.select().from(periodos).where(eq(periodos.id, periodoB.id)));

    expect(filas).toHaveLength(0);
  });

  it('dos requests concurrentes con la misma identidad nueva resuelven al mismo tenant', async () => {
    const idEnProveedor = `test-concurrencia-${randomUUID()}`;

    const [primero, segundo] = await Promise.all([
      resolverOcrearIdentidad(idEnProveedor),
      resolverOcrearIdentidad(idEnProveedor),
    ]);

    expect(primero.tenantId).toBe(segundo.tenantId);
    expect(primero.usuarioId).toBe(segundo.usuarioId);
  });
});
