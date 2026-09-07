import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants } from '../../src/db/schema/tenants.js';
import { usuarios } from '../../src/db/schema/identidad.js';
import { asientos, cuentas, movimientos } from '../../src/db/schema/ledger.js';
import { periodos } from '../../src/db/schema/periodos.js';
import { ingresos } from '../../src/db/schema/ingresos.js';
import { gastos } from '../../src/db/schema/gastos.js';
import { resumenes } from '../../src/db/schema/cierre.js';
import { arrastres } from '../../src/db/schema/arrastres.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCuenta, obtenerSaldoCuenta, registrarMovimiento } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo, listarPeriodos } from '../../src/modulos/periodos/crear-periodo.js';
import { listarIngresos, registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { eliminarGasto, listarGastos, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
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

  it('listarPeriodos nunca devuelve periodos de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-listar-periodos-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-listar-periodos-b-${randomUUID()}`);

    await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    const resultado = await listarPeriodos(identidadA.tenantId, new Date('2026-08-01T00:00:00Z'));

    expect(resultado).toEqual([]);
  });

  it('un tenant no puede leer el ingreso de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-ingresos-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-ingresos-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const { id: ingresoIdB } = await registrarIngreso({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const filas = await conTenant(identidadA.tenantId, (tx) => tx.select().from(ingresos).where(eq(ingresos.id, ingresoIdB)));

    expect(filas).toHaveLength(0);
  });

  it('un tenant no puede leer el gasto de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-gastos-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-gastos-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const { id: gastoIdB } = await registrarGasto({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    const filas = await conTenant(identidadA.tenantId, (tx) => tx.select().from(gastos).where(eq(gastos.id, gastoIdB)));

    expect(filas).toHaveLength(0);
  });

  it('un tenant no puede eliminar el gasto de otro tenant vía gastoId (BOLA)', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-editar-gasto-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-editar-gasto-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const { id: gastoIdB } = await registrarGasto({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    // El `WHERE tenantId = <A>` de eliminarGasto (más RLS por debajo) no
    // distingue "no existe" de "existe pero es de otro tenant" — mismo
    // criterio de defensa en profundidad que ya se prueba para periodos.
    await expect(
      eliminarGasto({ tenantId: identidadA.tenantId, gastoId: gastoIdB, fechaReferencia: new Date('2026-08-01T00:00:00Z') })
    ).rejects.toMatchObject({
      codigo: 'GASTO_NO_ENCONTRADO',
    });

    // Y el gasto de B sigue intacto: A no logró revertirlo de rebote.
    expect(await obtenerSaldoCuenta(identidadB.tenantId, periodoB.cuentaId)).toBe(-1000n);
  });

  it('un tenant no puede listar los ingresos ni los gastos del periodo de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-listar-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-listar-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await registrarGasto({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 500n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });

    // Mismo criterio que el resto: "no existe" y "existe pero es de otro
    // tenant" se ven idénticos desde A.
    await expect(listarIngresos(identidadA.tenantId, periodoB.id)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
    await expect(listarGastos(identidadA.tenantId, periodoB.id)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('un tenant no puede leer el resumen de cierre de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-resumen-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-resumen-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    const resumenB = await cerrarPeriodoManualmente(identidadB.tenantId, periodoB.id, new Date('2026-08-10T00:00:00Z'));

    const filas = await conTenant(identidadA.tenantId, (tx) => tx.select().from(resumenes).where(eq(resumenes.id, resumenB.id)));

    expect(filas).toHaveLength(0);
  });

  it('un tenant no puede leer el arrastre de otro tenant', async () => {
    const identidadA = await resolverOcrearIdentidad(`test-aislamiento-arrastre-a-${randomUUID()}`);
    const identidadB = await resolverOcrearIdentidad(`test-aislamiento-arrastre-b-${randomUUID()}`);

    const periodoB = await crearPeriodo(identidadB.tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarGasto({
      tenantId: identidadB.tenantId,
      periodoId: periodoB.id,
      monto: 500n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    // Déficit: arrastrado automático, genera una fila en arrastres al cerrar.
    await cerrarPeriodoManualmente(identidadB.tenantId, periodoB.id, new Date('2026-08-10T00:00:00Z'));

    const filas = await conTenant(identidadA.tenantId, (tx) =>
      tx.select().from(arrastres).where(eq(arrastres.periodoOrigenId, periodoB.id))
    );

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
