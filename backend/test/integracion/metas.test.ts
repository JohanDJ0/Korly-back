import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants, type Plan } from '../../src/db/schema/tenants.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { aportarAMeta, crearMeta, eliminarMeta, listarMetas, retirarDeMeta } from '../../src/modulos/metas/metas.js';
import { conTenant } from '../../src/shared/db.js';

describe('metas de ahorro', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-metas-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

  /** No hay endpoint público para esto a propósito (ver planes.ts) — se escribe directo, mismo criterio que insertarBorrador en tarjetas.test.ts. */
  async function establecerPlan(tenantId: string, plan: Plan) {
    return conTenant(tenantId, (tx) => tx.update(tenants).set({ plan }).where(eq(tenants.id, tenantId)));
  }

  const HOY = new Date('2026-08-01T00:00:00Z');

  describe('crearMeta', () => {
    it('crea la meta y su cuenta de ledger en 0', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 500000n, 'MXN');

      expect(meta.nombre).toBe('Vacaciones');
      expect(meta.montoObjetivoValorMinimo).toBe(500000n);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });

    it('rechaza un monto objetivo no positivo', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(crearMeta(tenantId, 'Vacaciones', 0n, 'MXN')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('rechaza un nombre vacío', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(crearMeta(tenantId, '   ', 1000n, 'MXN')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('plan free: rechaza crear una tercera meta (límite 2, documento-maestro-v2.md §9.2)', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await crearMeta(tenantId, 'Fondo de emergencia', 2000n, 'MXN');

      await expect(crearMeta(tenantId, 'Una tercera', 500n, 'MXN')).rejects.toMatchObject({ codigo: 'LIMITE_METAS_ALCANZADO' });
      expect(await listarMetas(tenantId)).toHaveLength(2);
    });

    it('plan pro: no tiene límite de metas', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await establecerPlan(tenantId, 'pro');
      await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await crearMeta(tenantId, 'Fondo de emergencia', 2000n, 'MXN');

      await expect(crearMeta(tenantId, 'Una tercera', 500n, 'MXN')).resolves.toBeDefined();
      expect(await listarMetas(tenantId)).toHaveLength(3);
    });
  });

  describe('eliminarMeta', () => {
    it('rechaza una meta que no existe (BOLA)', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(eliminarMeta(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });

    it('rechaza una meta de otro tenant (BOLA)', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const { tenantId: otroTenantId } = await tenantConPeriodoActivo();
      const metaAjena = await crearMeta(otroTenantId, 'Vacaciones', 1000n, 'MXN');

      await expect(eliminarMeta(tenantId, metaAjena.id)).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });

    it('elimina una meta sin aportes ni retiros de verdad — ya no aparece en el listado', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

      await eliminarMeta(tenantId, meta.id);

      expect(await listarMetas(tenantId)).toHaveLength(0);
    });

    it('rechaza eliminar una meta que ya tiene un aporte registrado', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });

      await expect(eliminarMeta(tenantId, meta.id)).rejects.toMatchObject({ codigo: 'META_CON_HISTORIAL' });
    });

    it('rechaza eliminar una meta incluso si un aporte y un retiro idénticos la dejaron de vuelta en saldo 0', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', motivo: 'Ya no la necesito', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
      await expect(eliminarMeta(tenantId, meta.id)).rejects.toMatchObject({ codigo: 'META_CON_HISTORIAL' });
    });
  });

  describe('listarMetas', () => {
    it('sin metas, devuelve una lista vacía', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      expect(await listarMetas(tenantId)).toEqual([]);
    });

    it('calcula montoAcumulado y porcentajeAvance a partir del saldo real, más reciente primero', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const primera = await crearMeta(tenantId, 'Primera', 1000n, 'MXN');
      const segunda = await crearMeta(tenantId, 'Segunda', 2000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: segunda.id, monto: 500n, moneda: 'MXN', fechaReferencia: HOY });

      const lista = await listarMetas(tenantId);

      expect(lista.map((m) => m.id)).toEqual([segunda.id, primera.id]);
      expect(lista[0]).toMatchObject({ montoAcumuladoValorMinimo: 500n, porcentajeAvance: 25 });
      expect(lista[1]).toMatchObject({ montoAcumuladoValorMinimo: 0n, porcentajeAvance: 0 });
    });
  });

  describe('aportarAMeta', () => {
    it('reduce el saldo del periodo activo y aumenta el de la meta en la misma cantidad', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

      const resultado = await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });

      expect(resultado.periodoOrigenId).toBe(periodo.id);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(4700n);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(300n);
    });

    it('rechaza un monto no positivo', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 0n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
    });

    it('rechaza una meta inexistente', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(
        aportarAMeta({ tenantId, metaId: randomUUID(), monto: 100n, moneda: 'MXN', fechaReferencia: HOY })
      ).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });

    it('rechaza aportar sin periodo activo', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));
      // A propósito: nadie creó el periodo siguiente todavía.

      await expect(
        aportarAMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', fechaReferencia: new Date('2026-08-17T00:00:00Z') })
      ).rejects.toMatchObject({ codigo: 'SIN_PERIODO_ACTIVO' });
    });
  });

  describe('retirarDeMeta', () => {
    it('aumenta el saldo del periodo activo y reduce el de la meta en la misma cantidad', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });

      const resultado = await retirarDeMeta({ tenantId, metaId: meta.id, monto: 120n, moneda: 'MXN', motivo: 'Emergencia', fechaReferencia: HOY });

      expect(resultado.periodoDestinoId).toBe(periodo.id);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(4820n); // 5000 - 300 + 120
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(180n); // 300 - 120
    });

    it('rechaza un motivo vacío', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await expect(
        retirarDeMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', motivo: '  ', fechaReferencia: HOY })
      ).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('rechaza retirar sin periodo activo', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));

      await expect(
        retirarDeMeta({
          tenantId,
          metaId: meta.id,
          monto: 100n,
          moneda: 'MXN',
          motivo: 'Emergencia',
          fechaReferencia: new Date('2026-08-17T00:00:00Z'),
        })
      ).rejects.toMatchObject({ codigo: 'SIN_PERIODO_ACTIVO' });
    });

    it('permite retirar más de lo acumulado (sin guardarraíles artificiales, mismo criterio que el sobregiro de gastos)', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', fechaReferencia: HOY });

      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', motivo: 'Emergencia', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(-200n);
    });
  });

  describe('decidirSobrante("ahorrar")', () => {
    it('reclama el sobrante de inmediato hacia la cuenta de la meta', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 5000n, 'MXN');
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));

      const resultado = await decidirSobrante(tenantId, periodo.id, 'ahorrar', meta.id, new Date('2026-08-10T00:00:00Z'));

      expect(resultado.decision).toBe('ahorrado');
      expect(resultado.montoAplicadoValorMinimo).toBe(1000n);
      // Reclamado de inmediato — no hace falta crear ningún periodo siguiente.
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(1000n);
      // Y la cuenta puente no se queda con el dinero esperando.
      const siguiente = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));
      expect(await obtenerSaldoCuenta(tenantId, siguiente.cuentaId)).toBe(0n);
    });

    it('rechaza decidir dos veces (ya ahorrado)', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 1000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 5000n, 'MXN');
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
      await decidirSobrante(tenantId, periodo.id, 'ahorrar', meta.id, new Date('2026-08-10T00:00:00Z'));

      await expect(decidirSobrante(tenantId, periodo.id, 'arrastrar')).rejects.toMatchObject({ codigo: 'SOBRANTE_YA_DECIDIDO' });
    });
  });
});
