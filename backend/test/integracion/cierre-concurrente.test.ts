import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resumenes } from '../../src/db/schema/cierre.js';
import { movimientos } from '../../src/db/schema/ledger.js';
import { periodos } from '../../src/db/schema/periodos.js';
import { consultarDisponible } from '../../src/modulos/disponible/consultar-disponible.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { crearPeriodo, listarPeriodos, obtenerPeriodoActivo, obtenerPeriodoPorId } from '../../src/modulos/periodos/crear-periodo.js';
import { obtenerResumenPendiente } from '../../src/modulos/cierre/generar-resumen.js';
import { conTenant } from '../../src/shared/db.js';

/**
 * Hallazgo real (2026-10-16, cuenta de producción): el día en que vence la quincena, la primera vez que la persona entra la
 * pantalla pide varias cosas a la vez (periodo, cifra, resumen pendiente, historial...) y cada petición, en su propia
 * transacción, veía el periodo vencido y trataba de cerrarlo. La primera lo lograba; las demás chocaban con el resumen que
 * la primera acababa de crear y devolvían "Ocurrió un error inesperado" hasta recargar la página.
 */
describe('cierre perezoso con peticiones simultáneas (el día que vence la quincena)', () => {
  async function tenantConQuincenaVencida() {
    const { tenantId } = await resolverOcrearIdentidad(`test-cierre-concurrente-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 300000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: new Date('2026-08-01T00:00:00Z') });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 120000n, moneda: 'MXN', fechaEfectiva: '2026-08-05', fechaReferencia: new Date('2026-08-05T00:00:00Z') });
    return { tenantId, periodo };
  }

  const DIA_DESPUES = new Date('2026-08-16T12:00:00Z'); // la quincena del 1 al 15 ya venció

  /** Lo que hace la pantalla de Inicio al entrar: varias consultas a la vez, cada una resuelve lo pendiente por su cuenta. */
  function lasQueHaceInicio(tenantId: string, periodoId: string) {
    return [
      () => obtenerPeriodoActivo(tenantId, DIA_DESPUES),
      () => consultarDisponible(tenantId, DIA_DESPUES),
      () => obtenerResumenPendiente(tenantId),
      () => listarPeriodos(tenantId, DIA_DESPUES),
      () => obtenerPeriodoPorId(tenantId, periodoId, DIA_DESPUES),
      () => consultarDisponible(tenantId, DIA_DESPUES),
    ];
  }

  /** Una sola cuenta rara vez dispara la carrera: se usan varias a la vez para que el resultado no dependa de la suerte. */
  async function conCarrera(cuentasEnParalelo = 6) {
    const cuentas = await Promise.all(Array.from({ length: cuentasEnParalelo }, () => tenantConQuincenaVencida()));
    const resultados = await Promise.allSettled(cuentas.flatMap(({ tenantId, periodo }) => lasQueHaceInicio(tenantId, periodo.id).map((consulta) => consulta())));
    return { cuentas, resultados };
  }

  it('varias peticiones a la vez sobre una quincena vencida terminan todas bien (ninguna da error)', async () => {
    const { resultados } = await conCarrera();

    expect(resultados.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason).slice(0, 160))).toEqual([]);
  });

  it('el cierre ocurre una sola vez por cuenta: un solo resumen vigente, el periodo cerrado y un solo drenado del sobrante', async () => {
    const { cuentas } = await conCarrera();

    for (const { tenantId, periodo } of cuentas) {
      const { resumenesVigentes, cerrados, drenados } = await conTenant(tenantId, async (tx) => {
        const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(resumenes).where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodo.id), sql`anulado_en is null`));
        const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(periodos).where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, periodo.id), eq(periodos.estado, 'cerrado')));
        const [d] = await tx.select({ n: sql<number>`count(*)::int` }).from(movimientos).where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.tipo, 'arrastre_sobrante')));
        return { resumenesVigentes: r?.n, cerrados: c?.n, drenados: d?.n };
      });
      expect({ resumenesVigentes, cerrados, drenados }).toEqual({ resumenesVigentes: 1, cerrados: 1, drenados: 1 });
    }
  });

  it('después de la carrera, el sobrante pendiente de cada cuenta queda a la vista para decidir (el resumen existe y es único)', async () => {
    const { cuentas } = await conCarrera();

    for (const { tenantId, periodo } of cuentas) {
      const pendiente = await obtenerResumenPendiente(tenantId);
      expect(pendiente?.periodoId).toBe(periodo.id);
      expect(pendiente?.sobranteValorMinimo).toBe(180000n); // 3,000 − 1,200
    }
  });

  it('una cuenta que ya cerró su quincena sigue respondiendo bien a peticiones simultáneas (el camino normal no se traba)', async () => {
    const { cuentas } = await conCarrera(2);
    const { tenantId, periodo } = cuentas[0]!;

    const otra = await Promise.allSettled(lasQueHaceInicio(tenantId, periodo.id).map((consulta) => consulta()));

    expect(otra.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});
