import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants, type Plan } from '../../src/db/schema/tenants.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { consultarDisponible } from '../../src/modulos/disponible/consultar-disponible.js';
import { aportarAMeta, crearMeta, deshacerDepositoMeta, deshacerPagoMeta, depositarEnMeta, editarMeta, eliminarMeta, listarMetas, listarMovimientosDeMeta, pagarConMeta, retirarDeMeta } from '../../src/modulos/metas/metas.js';
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

    it('el mensaje del límite no manda a contratar Pro mientras Pro no se vende (COBROS_HABILITADOS apagado), y sí cuando se vende', async () => {
      const anterior = process.env.COBROS_HABILITADOS;
      try {
        const { tenantId } = await tenantConPeriodoActivo();
        await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
        await crearMeta(tenantId, 'Fondo de emergencia', 2000n, 'MXN');

        delete process.env.COBROS_HABILITADOS;
        await expect(crearMeta(tenantId, 'Una tercera', 500n, 'MXN')).rejects.toThrow(/llegarán con Korly Pro.*avisemos/);
        process.env.COBROS_HABILITADOS = 'true';
        await expect(crearMeta(tenantId, 'Una tercera', 500n, 'MXN')).rejects.toThrow('Korly Pro las tiene ilimitadas');
      } finally {
        if (anterior === undefined) delete process.env.COBROS_HABILITADOS;
        else process.env.COBROS_HABILITADOS = anterior;
      }
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

    it('con historial pero saldo en 0 (un aporte y un retiro idénticos) se archiva: sale del listado, conserva su historial', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', motivo: 'Ya no la necesito', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
      await eliminarMeta(tenantId, meta.id);

      expect(await listarMetas(tenantId)).toHaveLength(0);
      // El ledger sigue intacto: el aporte y el retiro se conservan y la quincena queda como estaba (5000 - 300 + 300).
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(5000n);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });

    it('una meta archivada se trata como inexistente: no admite aportes, retiros, pagos, ediciones ni otra eliminación', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY });
      await eliminarMeta(tenantId, meta.id);

      const noExiste = { codigo: 'META_NO_ENCONTRADA' };
      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 10n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject(noExiste);
      await expect(retirarDeMeta({ tenantId, metaId: meta.id, monto: 10n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY })).rejects.toMatchObject(noExiste);
      await expect(pagarConMeta({ tenantId, metaId: meta.id, monto: 10n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY })).rejects.toMatchObject(noExiste);
      await expect(editarMeta({ tenantId, metaId: meta.id, nombre: 'Otro' })).rejects.toMatchObject(noExiste);
      await expect(eliminarMeta(tenantId, meta.id)).rejects.toMatchObject(noExiste);
    });

    it('con saldo a favor se rechaza, con un mensaje que dice cómo dejarla en cero', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY });

      await expect(eliminarMeta(tenantId, meta.id)).rejects.toMatchObject({
        codigo: 'META_CON_HISTORIAL',
        message: expect.stringContaining('Déjala en cero'),
      });
      expect(await listarMetas(tenantId)).toHaveLength(1);
    });

    it('plan free: una meta archivada no cuenta para el límite de 2', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const primera = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await crearMeta(tenantId, 'Fondo de emergencia', 2000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: primera.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: primera.id, monto: 300n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY });
      await eliminarMeta(tenantId, primera.id);

      await expect(crearMeta(tenantId, 'Una nueva', 500n, 'MXN')).resolves.toBeDefined();
      expect(await listarMetas(tenantId)).toHaveLength(2);
    });
  });

  describe('editarMeta', () => {
    it('cambia el nombre y el objetivo, y el avance se recalcula sobre el saldo real', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 500n, moneda: 'MXN', fechaReferencia: HOY });
      expect((await listarMetas(tenantId))[0]?.porcentajeAvance).toBe(50);

      await editarMeta({ tenantId, metaId: meta.id, nombre: '  Viaje a Quintana ', montoObjetivo: 2000n });

      const [editada] = await listarMetas(tenantId);
      expect(editada).toMatchObject({ nombre: 'Viaje a Quintana', montoObjetivoValorMinimo: 2000n, montoAcumuladoValorMinimo: 500n, porcentajeAvance: 25 });
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(500n); // el ledger no se tocó
    });

    it('permite cambiar solo uno de los dos campos', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

      await editarMeta({ tenantId, metaId: meta.id, montoObjetivo: 3000n });
      await editarMeta({ tenantId, metaId: meta.id, nombre: 'Otro nombre' });

      expect((await listarMetas(tenantId))[0]).toMatchObject({ nombre: 'Otro nombre', montoObjetivoValorMinimo: 3000n });
    });

    it('rechaza no indicar nada, un nombre vacío y un objetivo no positivo', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

      await expect(editarMeta({ tenantId, metaId: meta.id })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(editarMeta({ tenantId, metaId: meta.id, nombre: '   ' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(editarMeta({ tenantId, metaId: meta.id, montoObjetivo: 0n })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      expect((await listarMetas(tenantId))[0]).toMatchObject({ nombre: 'Vacaciones', montoObjetivoValorMinimo: 1000n });
    });

    it('rechaza una meta que no existe o de otro tenant (BOLA)', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const { tenantId: otroTenantId } = await tenantConPeriodoActivo();
      const metaAjena = await crearMeta(otroTenantId, 'Ajena', 1000n, 'MXN');

      await expect(editarMeta({ tenantId, metaId: randomUUID(), nombre: 'x' })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
      await expect(editarMeta({ tenantId, metaId: metaAjena.id, nombre: 'x' })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
      expect((await listarMetas(otroTenantId))[0]?.nombre).toBe('Ajena');
    });
  });

  describe('listarMetas', () => {
    it('sin metas, devuelve una lista vacía', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      expect(await listarMetas(tenantId)).toEqual([]);
    });

    it('calcula montoAcumulado y porcentajeAvance a partir del saldo real, más reciente primero', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
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

    it('no deja aportar más de lo que hay disponible en la quincena, sin tocar nada', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');

      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 5001n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({
        codigo: 'APORTE_EXCEDE_DISPONIBLE',
      });
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(5000n);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });

    it('permite aportar exactamente todo lo disponible, y el disponible baja a cero', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');

      await aportarAMeta({ tenantId, metaId: meta.id, monto: 5000n, moneda: 'MXN', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(0n);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(5000n);
    });

    it('sin ingreso registrado no hay disponible: no se puede aportar', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');

      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({
        codigo: 'APORTE_EXCEDE_DISPONIBLE',
      });
    });

    it('descuenta también lo ya gastado: con $5,000 de ingreso y $4,000 gastados, aportar $1,500 se rechaza', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      await registrarGasto({ tenantId, periodoId: periodo.id, monto: 4000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');

      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 1500n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({
        codigo: 'APORTE_EXCEDE_DISPONIBLE',
      });
      await expect(aportarAMeta({ tenantId, metaId: meta.id, monto: 1000n, moneda: 'MXN', fechaReferencia: HOY })).resolves.toBeDefined();
    });

    it('dos aportes simultáneos no pueden pasarse entre sí del disponible', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');

      const resultados = await Promise.allSettled([
        aportarAMeta({ tenantId, metaId: meta.id, monto: 3000n, moneda: 'MXN', fechaReferencia: HOY }),
        aportarAMeta({ tenantId, metaId: meta.id, monto: 3000n, moneda: 'MXN', fechaReferencia: HOY }),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(2000n);
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

    it('no deja retirar más de lo que tiene la meta, sin tocar la quincena ni la meta', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', fechaReferencia: HOY });

      await expect(
        retirarDeMeta({ tenantId, metaId: meta.id, monto: 101n, moneda: 'MXN', motivo: 'Emergencia', fechaReferencia: HOY })
      ).rejects.toMatchObject({ codigo: 'SALDO_META_INSUFICIENTE' });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(100n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(4900n);
    });

    it('permite retirar exactamente todo lo que tiene la meta', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', fechaReferencia: HOY });

      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', motivo: 'Todo', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(5000n);
    });

    it('dos retiros simultáneos no pueden sobregirar la meta', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Vacaciones', 1000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 500n, moneda: 'MXN', fechaReferencia: HOY });

      const resultados = await Promise.allSettled([
        retirarDeMeta({ tenantId, metaId: meta.id, monto: 400n, moneda: 'MXN', motivo: 'A', fechaReferencia: HOY }),
        retirarDeMeta({ tenantId, metaId: meta.id, monto: 400n, moneda: 'MXN', motivo: 'B', fechaReferencia: HOY }),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(100n);
    });
  });

  describe('pagarConMeta', () => {
    /** Periodo con ingreso de 5000 y una meta con 600 ahorrados. */
    async function escenario() {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Quintana', 100000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 600n, moneda: 'MXN', fechaReferencia: HOY });
      return { tenantId, periodo, meta };
    }

    it('descuenta de la meta y NO toca la quincena: ni el saldo del periodo, ni el disponible, ni su resumen', async () => {
      const { tenantId, periodo, meta } = await escenario();
      const antes = await consultarDisponible(tenantId, HOY);

      await pagarConMeta({ tenantId, metaId: meta.id, monto: 250n, moneda: 'MXN', motivo: 'Pago de la renta', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(350n); // 600 - 250
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(4400n); // 5000 - 600 (solo el aporte)
      expect(await consultarDisponible(tenantId, HOY)).toEqual(antes);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
      expect(resumen.totalIngresosValorMinimo).toBe(5000n); // el pago no aparece como ingreso...
      expect(resumen.totalGastadoValorMinimo).toBe(600n); // ...ni como gasto: solo el aporte
    });

    it('a diferencia de retirar, no exige periodo activo', async () => {
      const { tenantId, periodo, meta } = await escenario();
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));

      await pagarConMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', motivo: 'Pago', fechaReferencia: new Date('2026-08-17T00:00:00Z') });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(500n);
    });

    it('rechaza pagar más de lo que tiene la meta, sin tocar nada', async () => {
      const { tenantId, meta } = await escenario();

      await expect(
        pagarConMeta({ tenantId, metaId: meta.id, monto: 601n, moneda: 'MXN', motivo: 'Demasiado', fechaReferencia: HOY })
      ).rejects.toMatchObject({ codigo: 'SALDO_META_INSUFICIENTE' });
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(600n);
    });

    it('permite pagar exactamente todo el saldo de la meta', async () => {
      const { tenantId, meta } = await escenario();

      await pagarConMeta({ tenantId, metaId: meta.id, monto: 600n, moneda: 'MXN', motivo: 'Todo', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });

    it('rechaza un monto no positivo y un motivo vacío', async () => {
      const { tenantId, meta } = await escenario();

      await expect(pagarConMeta({ tenantId, metaId: meta.id, monto: 0n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(pagarConMeta({ tenantId, metaId: meta.id, monto: 10n, moneda: 'MXN', motivo: '  ', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });

    it('rechaza una meta que no existe o de otro tenant (BOLA)', async () => {
      const { tenantId } = await escenario();
      const otro = await escenario();

      await expect(pagarConMeta({ tenantId, metaId: randomUUID(), monto: 10n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
      await expect(pagarConMeta({ tenantId, metaId: otro.meta.id, monto: 10n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });

    it('dos pagos simultáneos no pueden sobregirar la meta', async () => {
      const { tenantId, meta } = await escenario();

      const resultados = await Promise.allSettled([
        pagarConMeta({ tenantId, metaId: meta.id, monto: 400n, moneda: 'MXN', motivo: 'A', fechaReferencia: HOY }),
        pagarConMeta({ tenantId, metaId: meta.id, monto: 400n, moneda: 'MXN', motivo: 'B', fechaReferencia: HOY }),
      ]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(200n);
    });
  });

  describe('deshacerPagoMeta', () => {
    async function conUnPago() {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Quintana', 100000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 600n, moneda: 'MXN', fechaReferencia: HOY });
      const pago = await pagarConMeta({ tenantId, metaId: meta.id, monto: 250n, moneda: 'MXN', motivo: 'Renta', fechaReferencia: HOY });
      return { tenantId, periodo, meta, pago };
    }

    it('devuelve el dinero a la meta, no a la quincena', async () => {
      const { tenantId, periodo, meta, pago } = await conUnPago();

      await deshacerPagoMeta(tenantId, meta.id, pago.id, HOY);

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(600n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(4400n); // sin cambios
    });

    it('rechaza deshacer dos veces el mismo pago', async () => {
      const { tenantId, meta, pago } = await conUnPago();
      await deshacerPagoMeta(tenantId, meta.id, pago.id, HOY);

      await expect(deshacerPagoMeta(tenantId, meta.id, pago.id, HOY)).rejects.toMatchObject({ codigo: 'PAGO_META_YA_REVERTIDO' });
    });

    it('solo deshace pagos: un retiro o un aporte de la misma meta se rechaza', async () => {
      const { tenantId, periodo, meta } = await conUnPago();
      const retiro = await retirarDeMeta({ tenantId, metaId: meta.id, monto: 50n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY });

      await expect(deshacerPagoMeta(tenantId, meta.id, retiro.id, HOY)).rejects.toMatchObject({ codigo: 'PAGO_META_NO_ENCONTRADO' });
      await expect(deshacerPagoMeta(tenantId, meta.id, randomUUID(), HOY)).rejects.toMatchObject({ codigo: 'PAGO_META_NO_ENCONTRADO' });
      expect(periodo.id).toBeDefined();
    });

    it('rechaza el pago de una meta ajena (BOLA)', async () => {
      const { tenantId } = await conUnPago();
      const otro = await conUnPago();

      await expect(deshacerPagoMeta(tenantId, otro.meta.id, otro.pago.id, HOY)).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });
  });

  describe('listarMovimientosDeMeta', () => {
    it('lista aportes, retiros y pagos con su signo; las reversiones no salen como filas y marcan a su original', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Quintana', 100000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: 600n, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 50n, moneda: 'MXN', motivo: 'Pasa a la quincena', fechaReferencia: HOY });
      const pago = await pagarConMeta({ tenantId, metaId: meta.id, monto: 250n, moneda: 'MXN', motivo: 'Renta', fechaReferencia: HOY });
      await deshacerPagoMeta(tenantId, meta.id, pago.id, HOY);

      const lista = await listarMovimientosDeMeta(tenantId, meta.id);

      expect(lista.map((m) => [m.tipo, m.montoValorMinimo, m.revertido])).toEqual([
        ['pago', -250n, true],
        ['retiro', -50n, false],
        ['aporte', 600n, false],
      ]);
      expect(lista[0]?.nota).toBe('Renta');
    });

    it('rechaza una meta ajena (BOLA)', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      const { tenantId: otroTenant } = await tenantConPeriodoActivo();
      const metaAjena = await crearMeta(otroTenant, 'Ajena', 1000n, 'MXN');

      await expect(listarMovimientosDeMeta(tenantId, metaAjena.id)).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });
  });

  describe('depositarEnMeta (aporte externo: dinero que ya existía fuera de la app)', () => {
    async function escenario() {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
      const meta = await crearMeta(tenantId, 'Quintana', 10000000n, 'MXN');
      return { tenantId, periodo, meta };
    }

    it('suma a la meta SIN tocar la quincena: ni su saldo, ni el disponible, ni el resumen', async () => {
      const { tenantId, periodo, meta } = await escenario();
      const antes = await consultarDisponible(tenantId, HOY);

      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 5000000n, moneda: 'MXN', motivo: 'Ahorro que ya tenía', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(5000000n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(5000n);
      expect(await consultarDisponible(tenantId, HOY)).toEqual(antes);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-10T00:00:00Z'));
      expect(resumen.totalIngresosValorMinimo).toBe(5000n);
      expect(resumen.totalGastadoValorMinimo).toBe(0n);
    });

    it('a diferencia de aportar, no está limitado por el disponible ni exige periodo activo', async () => {
      const { tenantId, periodo, meta } = await escenario();
      await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-08-16T00:00:00Z'));

      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 9000000n, moneda: 'MXN', fechaReferencia: new Date('2026-08-17T00:00:00Z') });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(9000000n);
    });

    it('rechaza un monto no positivo, una meta inexistente, ajena o archivada', async () => {
      const { tenantId, meta } = await escenario();
      const otro = await escenario();

      await expect(depositarEnMeta({ tenantId, metaId: meta.id, monto: 0n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(depositarEnMeta({ tenantId, metaId: randomUUID(), monto: 10n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
      await expect(depositarEnMeta({ tenantId, metaId: otro.meta.id, monto: 10n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });

      await eliminarMeta(tenantId, meta.id); // sin movimientos: se borra
      await expect(depositarEnMeta({ tenantId, metaId: meta.id, monto: 10n, moneda: 'MXN', fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
    });

    it('sale en el historial de la meta como aporte externo, con su motivo opcional', async () => {
      const { tenantId, meta } = await escenario();
      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 700n, moneda: 'MXN', motivo: '  Regalo  ', fechaReferencia: HOY });
      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 300n, moneda: 'MXN', fechaReferencia: HOY });

      const lista = await listarMovimientosDeMeta(tenantId, meta.id);

      expect(lista.map((m) => [m.tipo, m.montoValorMinimo, m.nota, m.revertido])).toEqual([
        ['deposito', 300n, null, false],
        ['deposito', 700n, 'Regalo', false],
      ]);
    });

    it('se puede deshacer mientras la meta conserve ese dinero: vuelve a "fuera", sin tocar la quincena', async () => {
      const { tenantId, periodo, meta } = await escenario();
      const deposito = await depositarEnMeta({ tenantId, metaId: meta.id, monto: 700n, moneda: 'MXN', fechaReferencia: HOY });

      await deshacerDepositoMeta(tenantId, meta.id, deposito.id, HOY);

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(5000n);
      expect((await listarMovimientosDeMeta(tenantId, meta.id))[0]).toMatchObject({ tipo: 'deposito', revertido: true });
      await expect(deshacerDepositoMeta(tenantId, meta.id, deposito.id, HOY)).rejects.toMatchObject({ codigo: 'DEPOSITO_META_YA_REVERTIDO' });
    });

    it('no se puede deshacer si la meta ya gastó ese dinero (la dejaría en negativo)', async () => {
      const { tenantId, meta } = await escenario();
      const deposito = await depositarEnMeta({ tenantId, metaId: meta.id, monto: 700n, moneda: 'MXN', fechaReferencia: HOY });
      await pagarConMeta({ tenantId, metaId: meta.id, monto: 500n, moneda: 'MXN', motivo: 'Renta', fechaReferencia: HOY });

      await expect(deshacerDepositoMeta(tenantId, meta.id, deposito.id, HOY)).rejects.toMatchObject({ codigo: 'SALDO_META_INSUFICIENTE' });
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(200n);
    });

    it('solo deshace aportes externos: un pago o un aporte de la quincena se rechaza, y el de otra meta también', async () => {
      const { tenantId, meta } = await escenario();
      const otra = await crearMeta(tenantId, 'Otra', 1000n, 'MXN');
      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 700n, moneda: 'MXN', fechaReferencia: HOY });
      const pago = await pagarConMeta({ tenantId, metaId: meta.id, monto: 100n, moneda: 'MXN', motivo: 'x', fechaReferencia: HOY });
      const ajeno = await depositarEnMeta({ tenantId, metaId: otra.id, monto: 50n, moneda: 'MXN', fechaReferencia: HOY });

      await expect(deshacerDepositoMeta(tenantId, meta.id, pago.id, HOY)).rejects.toMatchObject({ codigo: 'DEPOSITO_META_NO_ENCONTRADO' });
      await expect(deshacerDepositoMeta(tenantId, meta.id, ajeno.id, HOY)).rejects.toMatchObject({ codigo: 'DEPOSITO_META_NO_ENCONTRADO' });
      await expect(deshacerDepositoMeta(tenantId, meta.id, randomUUID(), HOY)).rejects.toMatchObject({ codigo: 'DEPOSITO_META_NO_ENCONTRADO' });
    });

    it('con el ahorro externo ya dentro, se puede retirar y pagar con la meta sin sobregirarla', async () => {
      const { tenantId, periodo, meta } = await escenario();
      await depositarEnMeta({ tenantId, metaId: meta.id, monto: 5000000n, moneda: 'MXN', fechaReferencia: HOY });

      await retirarDeMeta({ tenantId, metaId: meta.id, monto: 1000n, moneda: 'MXN', motivo: 'A la quincena', fechaReferencia: HOY });
      await pagarConMeta({ tenantId, metaId: meta.id, monto: 2000n, moneda: 'MXN', motivo: 'Pago', fechaReferencia: HOY });

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(4997000n);
      expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(6000n);
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
