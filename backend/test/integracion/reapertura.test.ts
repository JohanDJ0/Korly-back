import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { arrastres } from '../../src/db/schema/arrastres.js';
import { resumenes } from '../../src/db/schema/cierre.js';
import { periodos } from '../../src/db/schema/periodos.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { obtenerResumen, obtenerResumenPendiente } from '../../src/modulos/cierre/generar-resumen.js';
import { reabrirPeriodo } from '../../src/modulos/cierre/reabrir-periodo.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearMeta } from '../../src/modulos/metas/metas.js';
import { crearPeriodo, listarPeriodos, obtenerPeriodoActivo, obtenerPeriodoPorId } from '../../src/modulos/periodos/crear-periodo.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { conTenant } from '../../src/shared/db.js';
import { dbAdmin } from '../../src/shared/db-admin.js';

/**
 * ADR-009. Quincena 1–15 de agosto de 2026; "hoy" cae dentro de ella salvo
 * que la prueba diga lo contrario.
 */
describe('reapertura de periodo', () => {
  const INICIO = new Date('2026-08-01T00:00:00Z');
  const HOY = new Date('2026-08-10T12:00:00Z');

  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-reapertura-${randomUUID()}`);
    return tenantId;
  }

  /** Periodo activo con ingreso de 3000 y gasto de 1200: sobrante 1800. */
  async function periodoConActividad(tenantId: string) {
    const periodo = await crearPeriodo(tenantId, 'quincenal', INICIO);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 3000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: INICIO });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 1200n, moneda: 'MXN', fechaEfectiva: '2026-08-02', fechaReferencia: INICIO });
    return periodo;
  }

  async function todosLosResumenes(tenantId: string, periodoId: string) {
    return conTenant(tenantId, (tx) => tx.select().from(resumenes).where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodoId))));
  }

  describe('caso feliz', () => {
    it('devuelve el periodo a activo, recupera su saldo y anula el resumen sin borrarlo', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(0n); // el cierre drenó el sobrante

      await reabrirPeriodo(tenantId, periodo.id, HOY);

      expect((await obtenerPeriodoPorId(tenantId, periodo.id, HOY))?.estado).toBe('activo');
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(1800n);
      expect(await obtenerResumen(tenantId, periodo.id)).toBeNull(); // el vigente ya no existe
      const guardados = await todosLosResumenes(tenantId, periodo.id);
      expect(guardados).toHaveLength(1); // pero no se borró
      expect(guardados[0]?.anuladoEn).not.toBeNull();
    });

    it('el sobrante deja de aparecer como pendiente de decisión', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      expect(await obtenerResumenPendiente(tenantId)).not.toBeNull();

      await reabrirPeriodo(tenantId, periodo.id, HOY);

      expect(await obtenerResumenPendiente(tenantId)).toBeNull();
    });

    it('al volver a cerrar genera un resumen nuevo con los mismos totales, y conserva el anulado como historial', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      const primero = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await reabrirPeriodo(tenantId, periodo.id, HOY);

      const segundo = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

      expect(segundo.id).not.toBe(primero.id);
      expect(segundo.totalIngresosValorMinimo).toBe(3000n);
      expect(segundo.totalGastadoValorMinimo).toBe(1200n);
      expect(segundo.sobranteValorMinimo).toBe(1800n);
      const guardados = await todosLosResumenes(tenantId, periodo.id);
      expect(guardados.filter((r) => r.anuladoEn === null)).toHaveLength(1);
      expect(guardados.filter((r) => r.anuladoEn !== null)).toHaveLength(1);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(0n);
    });

    it('puede registrar gastos de nuevo en el periodo reabierto', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await reabrirPeriodo(tenantId, periodo.id, HOY);

      await registrarGasto({ tenantId, periodoId: periodo.id, monto: 300n, moneda: 'MXN', fechaEfectiva: '2026-08-10', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(1500n);
    });

    it('un déficit (que se decide solo al cerrar) también se puede reabrir mientras nadie reclame el arrastre', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await crearPeriodo(tenantId, 'quincenal', INICIO);
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: INICIO });
      await registrarGasto({ tenantId, periodoId: periodo.id, monto: 1500n, moneda: 'MXN', fechaEfectiva: '2026-08-02', fechaReferencia: INICIO });
      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      expect(resumen.decisionSobrante).toBe('arrastrado');

      await reabrirPeriodo(tenantId, periodo.id, HOY);

      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(-500n);
      expect((await obtenerPeriodoPorId(tenantId, periodo.id, HOY))?.estado).toBe('activo');
    });
  });

  describe('el escenario real: tras el cierre quedó activo un periodo duplicado de la quincena', () => {
    /**
     * Recurrente que cae en la quincena, creado antes de cualquier periodo: se materializa en el periodo y en su duplicado.
     * El duplicado nace como lo hacía antes la promoción automática del borrador (que ya no ocurre, ver promocion-borrador.test.ts):
     * cerrado el periodo real, se abre otro para las mismas fechas y materializa sus cargos automáticos.
     */
    async function conBorradorPromovido() {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Gas', montoValorMinimo: 500n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 10, fechaReferencia: INICIO });
      const periodo = await periodoConActividad(tenantId); // activo, con el recurrente materializado
      return { tenantId, periodo };
    }

    async function cerrarYDuplicar(tenantId: string, periodoId: string) {
      await cerrarPeriodoManualmente(tenantId, periodoId, HOY);
      const duplicado = await crearPeriodo(tenantId, 'quincenal', HOY);
      expect(duplicado.estado).toBe('activo');
      return { borradorId: duplicado.id, borradorCuentaId: duplicado.cuentaId };
    }

    it('retira el duplicado: lo marca descartado, anula sus cargos automáticos y reabre el periodo real', async () => {
      const { tenantId, periodo } = await conBorradorPromovido();
      const { borradorId, borradorCuentaId } = await cerrarYDuplicar(tenantId, periodo.id);
      expect((await obtenerPeriodoActivo(tenantId, HOY))?.id).toBe(borradorId);
      expect(await obtenerSaldoCuenta(tenantId, borradorCuentaId)).toBe(-500n); // el cargo automático

      await reabrirPeriodo(tenantId, periodo.id, HOY);

      expect((await obtenerPeriodoActivo(tenantId, HOY))?.id).toBe(periodo.id);
      expect(await obtenerSaldoCuenta(tenantId, borradorCuentaId)).toBe(0n);
      const estadoBorrador = await conTenant(tenantId, async (tx) => (await tx.select({ estado: periodos.estado }).from(periodos).where(eq(periodos.id, borradorId)))[0]?.estado);
      expect(estadoBorrador).toBe('descartado');
    });

    it('el duplicado descartado no aparece en el listado de periodos', async () => {
      const { tenantId, periodo } = await conBorradorPromovido();
      const { borradorId } = await cerrarYDuplicar(tenantId, periodo.id);
      await reabrirPeriodo(tenantId, periodo.id, HOY);

      const ids = (await listarPeriodos(tenantId, HOY)).map((p) => p.id);

      expect(ids).toContain(periodo.id);
      expect(ids).not.toContain(borradorId);
    });

    it('rechaza reabrir si el usuario ya registró algo en el periodo promovido, y no cambia nada', async () => {
      const { tenantId, periodo } = await conBorradorPromovido();
      const { borradorId, borradorCuentaId } = await cerrarYDuplicar(tenantId, periodo.id);
      await registrarGasto({ tenantId, periodoId: borradorId, monto: 80n, moneda: 'MXN', fechaEfectiva: '2026-08-10', fechaReferencia: HOY });

      await expect(reabrirPeriodo(tenantId, periodo.id, HOY)).rejects.toMatchObject({
        codigo: 'REAPERTURA_NO_PERMITIDA',
        message: expect.stringContaining('un movimiento tuyo'),
      });

      expect((await obtenerPeriodoPorId(tenantId, periodo.id, HOY))?.estado).toBe('cerrado');
      expect(await obtenerResumen(tenantId, periodo.id)).not.toBeNull();
      expect(await obtenerSaldoCuenta(tenantId, borradorCuentaId)).toBe(-580n); // intacto: la transacción se revirtió completa
    });
  });

  describe('cuándo no se puede', () => {
    it('si el sobrante ya se guardó en una meta', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');
      await decidirSobrante(tenantId, periodo.id, 'ahorrar', meta.id, HOY);

      await expect(reabrirPeriodo(tenantId, periodo.id, HOY)).rejects.toMatchObject({
        codigo: 'REAPERTURA_NO_PERMITIDA',
        message: expect.stringContaining('meta'),
      });
    });

    it('si otro periodo ya reclamó el arrastre', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await decidirSobrante(tenantId, periodo.id, 'arrastrar', undefined, HOY);
      await crearPeriodo(tenantId, 'quincenal', HOY); // el nuevo periodo activo reclama el arrastre decidido

      await expect(reabrirPeriodo(tenantId, periodo.id, HOY)).rejects.toMatchObject({
        codigo: 'REAPERTURA_NO_PERMITIDA',
        message: expect.stringContaining('periodo siguiente'),
      });
    });

    it('si la quincena del periodo ya terminó (se volvería a cerrar solo)', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

      await expect(reabrirPeriodo(tenantId, periodo.id, new Date('2026-08-20T12:00:00Z'))).rejects.toMatchObject({
        codigo: 'REAPERTURA_NO_PERMITIDA',
        message: expect.stringContaining('ya terminó'),
      });
    });

    it('si el periodo ya está abierto', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);

      await expect(reabrirPeriodo(tenantId, periodo.id, HOY)).rejects.toMatchObject({ codigo: 'REAPERTURA_NO_PERMITIDA', message: expect.stringContaining('ya está abierto') });
    });

    it('si el periodo no existe, o es de otro tenant', async () => {
      const tenantId = await tenantNuevo();
      const otro = await tenantNuevo();
      const ajeno = await periodoConActividad(otro);
      await cerrarPeriodoManualmente(otro, ajeno.id, HOY);

      await expect(reabrirPeriodo(tenantId, randomUUID(), HOY)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
      await expect(reabrirPeriodo(tenantId, ajeno.id, HOY)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
      await expect(reabrirPeriodo(tenantId, 'no-es-un-uuid', HOY)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
      expect((await obtenerPeriodoPorId(otro, ajeno.id, HOY))?.estado).toBe('cerrado'); // el intento no tocó al otro tenant
    });
  });

  describe('regresión: lo que lee resúmenes ignora los anulados', () => {
    it('el barrido automático de sobrantes no revienta con un resumen anulado pendiente y viejo', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await reabrirPeriodo(tenantId, periodo.id, HOY);

      // Dos semanas después la quincena venció: el cierre perezoso cierra de nuevo y corre el barrido de 7 días.
      // Sin excluir los anulados, el barrido intentaría actualizar el viejo y el trigger lo rechazaría.
      const futuro = new Date('2026-08-30T12:00:00Z');
      await expect(obtenerPeriodoActivo(tenantId, futuro)).resolves.not.toThrow();

      const guardados = await todosLosResumenes(tenantId, periodo.id);
      expect(guardados.find((r) => r.anuladoEn !== null)?.decisionSobrante).toBe('pendiente'); // el anulado no se tocó
    });

    it('un resumen anulado no se puede reclamar como arrastre', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await reabrirPeriodo(tenantId, periodo.id, HOY);

      const filas = await conTenant(tenantId, (tx) => tx.select().from(arrastres).where(eq(arrastres.tenantId, tenantId)));

      expect(filas).toHaveLength(1);
      expect(filas[0]?.periodoDestinoId).toBeNull();
      expect(filas[0]?.metaDestinoId).toBeNull();
    });
  });

  describe('defensa en la base de datos (trigger de la migración 0020)', () => {
    async function resumenAnulado() {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      await reabrirPeriodo(tenantId, periodo.id, HOY);
      const [anulado] = await todosLosResumenes(tenantId, periodo.id);
      return { tenantId, periodo, anulado: anulado! };
    }

    it('un resumen anulado no se puede volver a modificar', async () => {
      const { tenantId, anulado } = await resumenAnulado();

      await expect(conTenant(tenantId, (tx) => tx.update(resumenes).set({ decisionSobrante: 'arrastrado', decisionSobranteFecha: new Date() }).where(eq(resumenes.id, anulado.id)))).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/anulado/) },
      });
      await expect(conTenant(tenantId, (tx) => tx.update(resumenes).set({ anuladoEn: null }).where(eq(resumenes.id, anulado.id)))).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/anulado/) },
      });
    });

    it('no se puede borrar un resumen, ni siquiera uno anulado, ni con la conexión de administración', async () => {
      const { anulado } = await resumenAnulado();

      await expect(dbAdmin.execute(sql`delete from resumenes where id = ${anulado.id}`)).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/inmutable|no se permite|bloque/i) },
      });
    });

    it('anular no puede ir acompañado de un cambio de montos', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

      await expect(
        conTenant(tenantId, (tx) => tx.update(resumenes).set({ anuladoEn: new Date(), sobranteValorMinimo: 999999n }).where(eq(resumenes.id, resumen.id)))
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/Solo la decisión del sobrante y su anulación/) } });
    });

    it('anular no puede ir acompañado de un cambio de decisión', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

      await expect(
        conTenant(tenantId, (tx) => tx.update(resumenes).set({ anuladoEn: new Date(), decisionSobrante: 'arrastrado', decisionSobranteFecha: new Date() }).where(eq(resumenes.id, resumen.id)))
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/no puede cambiar la decisión/) } });
    });

    it('no se puede anular un resumen cuyo sobrante ya se guardó en una meta, aunque se intente directo en la base', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);
      const meta = await crearMeta(tenantId, 'Auto', 100000n, 'MXN');
      await decidirSobrante(tenantId, periodo.id, 'ahorrar', meta.id, HOY);

      await expect(conTenant(tenantId, (tx) => tx.update(resumenes).set({ anuladoEn: new Date() }).where(eq(resumenes.id, resumen.id)))).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/ya se destinó a una meta/) },
      });
    });

    it('dos resúmenes vigentes del mismo periodo siguen siendo imposibles', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await periodoConActividad(tenantId);
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

      await expect(
        conTenant(tenantId, (tx) =>
          tx.insert(resumenes).values({
            tenantId,
            periodoId: periodo.id,
            totalIngresosValorMinimo: 1n,
            totalGastadoValorMinimo: 0n,
            sobranteValorMinimo: 1n,
            moneda: 'MXN',
          })
        )
      ).rejects.toMatchObject({ cause: { code: '23505' } });
    });
  });
});
