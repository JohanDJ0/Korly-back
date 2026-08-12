import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';

/**
 * El mecanismo de materialización (modulos/cierre/materializar-arrastre.ts):
 * al cerrar, el sobrante/déficit se drena a la cuenta `arrastre_pendiente`
 * del tenant; al crear el periodo siguiente, se reclama de vuelta — pero
 * solo lo que ya está decidido como 'arrastrado', nunca lo que sigue
 * 'pendiente' (adelantaría una decisión que el usuario no ha tomado).
 */
describe('materialización del arrastre (cuenta arrastre_pendiente)', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-arrastre-${randomUUID()}`);
    return tenantId;
  }

  it('un sobrante positivo pendiente NO se reclama al crear el periodo siguiente', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({ tenantId, periodoId: p1.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' });
    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));
    // Sin decidirSobrante: sigue 'pendiente'.

    // A menos de DIAS_DEFAULT_ARRASTRE del cierre (6 días): el barrido de
    // N días que resolverPendientesTx dispara en cada creación de
    // periodo todavía no debe auto-decidirlo. 2026-08-16 además cae en
    // la segunda quincena (16-31), una ventana distinta a la de p1.
    const p2 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));

    expect(await obtenerSaldoCuenta(tenantId, p2.cuentaId)).toBe(0n);
  });

  it('un sobrante decidido como arrastrar se reclama al crear el periodo siguiente', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({ tenantId, periodoId: p1.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' });
    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));
    await decidirSobrante(tenantId, p1.id, 'arrastrar');

    const p2 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-20T00:00:00Z'));

    expect(await obtenerSaldoCuenta(tenantId, p2.cuentaId)).toBe(1000n);
  });

  it('un déficit se arrastra automáticamente y el periodo siguiente nace ya descontado', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({ tenantId, periodoId: p1.id, monto: 500n, moneda: 'MXN', fechaEfectiva: '2026-08-01' });
    await registrarGasto({ tenantId, periodoId: p1.id, monto: 2000n, moneda: 'MXN', fechaEfectiva: '2026-08-02' });
    // Déficit: decisionSobrante ya queda 'arrastrado' al cerrar, sin decidirSobrante.
    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));

    const p2 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-20T00:00:00Z'));

    expect(await obtenerSaldoCuenta(tenantId, p2.cuentaId)).toBe(-1500n);
  });

  it('dos arrastres acumulados (uno decidido después de que ya existía un periodo nuevo) se reclaman juntos', async () => {
    const tenantId = await tenantNuevo();

    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({ tenantId, periodoId: p1.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01' });
    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));
    // p1 sigue 'pendiente' cuando se crea p2 (6 días desde el cierre,
    // bajo el umbral del barrido de N días) — no se reclama todavía.

    const p2 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));
    expect(await obtenerSaldoCuenta(tenantId, p2.cuentaId)).toBe(0n);

    // Se decide DESPUÉS de que p2 ya existe y está activo — nada lo
    // reclama automáticamente en ese momento, solo al crear el próximo.
    await decidirSobrante(tenantId, p1.id, 'arrastrar');

    await registrarGasto({ tenantId, periodoId: p2.id, monto: 200n, moneda: 'MXN', fechaEfectiva: '2026-08-17' });
    // p2 cierra con déficit (0 - 200): se arrastra automático.
    await cerrarPeriodoManualmente(tenantId, p2.id, new Date('2026-08-25T00:00:00Z'));

    const p3 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-09-01T00:00:00Z'));

    // Reclama los dos: +1000 (de p1) y -200 (de p2) = 800.
    expect(await obtenerSaldoCuenta(tenantId, p3.cuentaId)).toBe(800n);
  });

  it('el arrastre de un tenant nunca se filtra al periodo nuevo de otro tenant (filtro explícito por tenant, no solo RLS)', async () => {
    const tenantA = await tenantNuevo();
    const pA = await crearPeriodo(tenantA, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarGasto({ tenantId: tenantA, periodoId: pA.id, monto: 400n, moneda: 'MXN', fechaEfectiva: '2026-08-01' });
    // Déficit de A: -400, arrastrado automático.
    await cerrarPeriodoManualmente(tenantA, pA.id, new Date('2026-08-10T00:00:00Z'));

    const tenantB = await tenantNuevo();
    const pB = await crearPeriodo(tenantB, 'quincenal', new Date('2026-08-01T00:00:00Z'));

    // Si reclamarArrastresTx no filtrara por tenant_id, el periodo nuevo
    // de B heredaría el déficit de A.
    expect(await obtenerSaldoCuenta(tenantB, pB.cuentaId)).toBe(0n);
  });
});
