import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { aportarAMeta, crearMeta, listarMetas, retirarDeMeta } from '../../src/modulos/metas/metas.js';

describe('metas de ahorro', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-metas-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
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
