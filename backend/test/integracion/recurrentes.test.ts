import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { periodos } from '../../src/db/schema/periodos.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada } from '../../src/modulos/categorias/categorias.js';
import { crearCuentaTx } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo, obtenerPeriodoActivo } from '../../src/modulos/periodos/crear-periodo.js';
import { editarGasto, listarGastos } from '../../src/modulos/gastos/registrar-gasto.js';
import { obtenerDesglose } from '../../src/modulos/desglose/desglose.js';
import { consultarDisponible } from '../../src/modulos/disponible/consultar-disponible.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { actualizarGastoRecurrente, crearGastoRecurrente, eliminarGastoRecurrente, listarGastosRecurrentes } from '../../src/modulos/recurrentes/recurrentes.js';
import { conTenant } from '../../src/shared/db.js';

describe('gastos recurrentes', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-recurrentes-${randomUUID()}`);
    return tenantId;
  }

  async function insertarBorrador(tenantId: string, fechaInicio: string, fechaFin: string) {
    return conTenant(tenantId, async (tx) => {
      const cuenta = await crearCuentaTx(tx, tenantId, 'periodo');
      const [periodo] = await tx
        .insert(periodos)
        .values({ tenantId, cuentaId: cuenta.id, tipo: 'quincenal', estado: 'borrador', fechaInicio, fechaFin })
        .returning();
      if (!periodo) throw new Error('setup falló');
      return periodo;
    });
  }

  describe('crearGastoRecurrente', () => {
    it('rechaza un monto no positivo', async () => {
      const tenantId = await tenantNuevo();
      await expect(
        crearGastoRecurrente({ tenantId, descripcion: 'Netflix', montoValorMinimo: 0n, moneda: 'MXN', frecuencia: 'quincenal' })
      ).rejects.toThrow(/positivo/);
    });

    it('rechaza "mensual" sin diaMes', async () => {
      const tenantId = await tenantNuevo();
      await expect(
        crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 500000n, moneda: 'MXN', frecuencia: 'mensual' })
      ).rejects.toThrow(/diaMes/);
    });

    it('rechaza "quincenal" con diaMes', async () => {
      const tenantId = await tenantNuevo();
      await expect(
        crearGastoRecurrente({ tenantId, descripcion: 'Gimnasio', montoValorMinimo: 30000n, moneda: 'MXN', frecuencia: 'quincenal', diaMes: 5 })
      ).rejects.toThrow(/diaMes/);
    });

    it('rechaza una categoría de otro tenant (BOLA)', async () => {
      const tenantId = await tenantNuevo();
      const otroTenantId = await tenantNuevo();
      const categoriaAjena = await crearCategoriaPersonalizada(otroTenantId, 'Ajena');

      await expect(
        crearGastoRecurrente({
          tenantId,
          descripcion: 'Netflix',
          montoValorMinimo: 20000n,
          moneda: 'MXN',
          frecuencia: 'quincenal',
          categoriaId: categoriaAjena.id,
        })
      ).rejects.toThrow(/no existe/);
    });

    it('crea uno válido, activo por defecto', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Netflix',
        montoValorMinimo: 19900n,
        moneda: 'MXN',
        frecuencia: 'mensual',
        diaMes: 20,
      });

      expect(recurrente.activo).toBe(true);
      expect(recurrente.frecuencia).toBe('mensual');
      expect(recurrente.diaMes).toBe(20);
    });
  });

  describe('actualizarGastoRecurrente', () => {
    it('pausa (activo=false) sin borrar la fila', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Spotify',
        montoValorMinimo: 11500n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
      });

      const actualizado = await actualizarGastoRecurrente({ tenantId, id: recurrente.id, activo: false });
      expect(actualizado.activo).toBe(false);

      const listado = await listarGastosRecurrentes(tenantId);
      expect(listado.find((r) => r.id === recurrente.id)?.activo).toBe(false);
    });

    it('cambiar de mensual a quincenal sin mandar diaMes lo limpia, no lo arrastra', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Renta',
        montoValorMinimo: 500000n,
        moneda: 'MXN',
        frecuencia: 'mensual',
        diaMes: 5,
      });

      const actualizado = await actualizarGastoRecurrente({ tenantId, id: recurrente.id, frecuencia: 'quincenal' });
      expect(actualizado.frecuencia).toBe('quincenal');
      expect(actualizado.diaMes).toBeNull();
    });

    it('lanza RECURRENTE_NO_ENCONTRADO para un id de otro tenant (BOLA)', async () => {
      const tenantId = await tenantNuevo();
      const otroTenantId = await tenantNuevo();
      const ajeno = await crearGastoRecurrente({
        tenantId: otroTenantId,
        descripcion: 'Ajeno',
        montoValorMinimo: 1000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
      });

      await expect(actualizarGastoRecurrente({ tenantId, id: ajeno.id, activo: false })).rejects.toThrow(/no existe/);
    });
  });

  describe('materialización al activar un periodo', () => {
    it('un recurrente "quincenal" se materializa en cada periodo nuevo', async () => {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Gimnasio', montoValorMinimo: 30000n, moneda: 'MXN', frecuencia: 'quincenal' });

      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(1);
      expect(datos[0]?.montoValorMinimo).toBe(30000n);
      expect(datos[0]?.esRecurrente).toBe(true);
      expect(datos[0]?.nota).toBe('Gimnasio');
    });

    it('un recurrente "mensual" con diaMes<=15 solo se materializa en la primera mitad del mes', async () => {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 500000n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 5 });

      const primeraMitad = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const { datos: gastosPrimeraMitad } = await listarGastos(tenantId, primeraMitad.id);
      expect(gastosPrimeraMitad).toHaveLength(1);

      // Fuerza la promoción del borrador de la segunda mitad para
      // comprobar que ahí NO se materializa (mismo mecanismo que
      // promocion-borrador.test.ts).
      const segundaMitad = await insertarBorrador(tenantId, '2026-08-16', '2026-08-31');
      const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));
      expect(activo?.id).toBe(segundaMitad.id);

      const { datos: gastosSegundaMitad } = await listarGastos(tenantId, segundaMitad.id);
      expect(gastosSegundaMitad).toHaveLength(0);
    });

    it('un recurrente "mensual" con diaMes>=16 solo se materializa en la segunda mitad del mes', async () => {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Netflix', montoValorMinimo: 19900n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 20 });

      const primeraMitad = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const { datos: gastosPrimeraMitad } = await listarGastos(tenantId, primeraMitad.id);
      expect(gastosPrimeraMitad).toHaveLength(0);
    });

    it('un recurrente "mensual" con diaMes=31 se materializa en la segunda mitad aunque el mes tenga menos días', async () => {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Seguro', montoValorMinimo: 80000n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 31 });

      // Septiembre 2026 tiene 30 días — la segunda mitad es 16-30.
      const borrador = await insertarBorrador(tenantId, '2026-09-16', '2026-09-30');
      const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-09-20T00:00:00Z'));
      expect(activo?.id).toBe(borrador.id);

      const { datos } = await listarGastos(tenantId, borrador.id);
      expect(datos).toHaveLength(1);
    });

    it('un recurrente pausado (activo=false) no se materializa', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Gimnasio',
        montoValorMinimo: 30000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
      });
      await actualizarGastoRecurrente({ tenantId, id: recurrente.id, activo: false });

      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(0);
    });

    it('un periodo creado en borrador (ya hay uno activo) NO materializa todavía', async () => {
      const tenantId = await tenantNuevo();
      await crearGastoRecurrente({ tenantId, descripcion: 'Gimnasio', montoValorMinimo: 30000n, moneda: 'MXN', frecuencia: 'quincenal' });

      await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const borrador = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      expect(borrador.estado).toBe('borrador');

      const { datos } = await listarGastos(tenantId, borrador.id);
      expect(datos).toHaveLength(0);
    });

    it('un recurrente "quincenal" creado mientras el periodo activo ya existe se materializa de inmediato en él (hallazgo real del usuario)', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      await crearGastoRecurrente({
        tenantId,
        descripcion: 'Gimnasio',
        montoValorMinimo: 30000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
        fechaReferencia: new Date('2026-08-05T00:00:00Z'),
      });

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(1);
      expect(datos[0]?.esRecurrente).toBe(true);
    });

    it('un recurrente "mensual" creado mientras el periodo activo SÍ le toca se materializa de inmediato (caso exacto reportado: periodo del 16, recurrente diaMes 17)', async () => {
      const tenantId = await tenantNuevo();
      // Periodo 16-30 de agosto, activo.
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));

      await crearGastoRecurrente({
        tenantId,
        descripcion: 'Renta',
        montoValorMinimo: 500000n,
        moneda: 'MXN',
        frecuencia: 'mensual',
        diaMes: 17,
        fechaReferencia: new Date('2026-08-16T00:00:00Z'),
      });

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(1);
      expect(datos[0]?.montoValorMinimo).toBe(500000n);
    });

    it('un recurrente "mensual" creado mientras el periodo activo NO le toca (mitad equivocada del mes) no se materializa todavía', async () => {
      const tenantId = await tenantNuevo();
      // Periodo 1-15 de agosto, activo — diaMes 17 le toca a la SEGUNDA mitad, no a esta.
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-05T00:00:00Z'));

      await crearGastoRecurrente({
        tenantId,
        descripcion: 'Renta',
        montoValorMinimo: 500000n,
        moneda: 'MXN',
        frecuencia: 'mensual',
        diaMes: 17,
        fechaReferencia: new Date('2026-08-05T00:00:00Z'),
      });

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(0);
    });

    it('un recurrente creado sin ningún periodo activo no falla, simplemente no materializa nada todavía', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Gimnasio',
        montoValorMinimo: 30000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
      });
      expect(recurrente.id).toBeDefined();
    });

    it('un recurrente creado cuando el único periodo "activo" en la fila ya venció (aún no lo cierra nadie) no se materializa en él', async () => {
      const tenantId = await tenantNuevo();
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

      // "Hoy" para crearGastoRecurrente es muy posterior al fin real del
      // periodo (2026-08-15) — aunque la fila siga diciendo 'activo'
      // porque nadie disparó el cierre perezoso, no debe materializarse ahí.
      await crearGastoRecurrente({
        tenantId,
        descripcion: 'Gimnasio',
        montoValorMinimo: 30000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
        fechaReferencia: new Date('2026-09-01T00:00:00Z'),
      });

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos).toHaveLength(0);
    });

    it('aislamiento entre tenants: el recurrente de un tenant no se materializa en el periodo de otro', async () => {
      const tenantA = await tenantNuevo();
      const tenantB = await tenantNuevo();
      await crearGastoRecurrente({ tenantId: tenantA, descripcion: 'Gimnasio', montoValorMinimo: 30000n, moneda: 'MXN', frecuencia: 'quincenal' });

      const periodoB = await crearPeriodo(tenantB, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const { datos } = await listarGastos(tenantB, periodoB.id);
      expect(datos).toHaveLength(0);
    });

    it('respeta la categoría asignada al recurrente en el gasto generado', async () => {
      const tenantId = await tenantNuevo();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Suscripciones');
      await crearGastoRecurrente({
        tenantId,
        descripcion: 'Netflix',
        montoValorMinimo: 19900n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
        categoriaId: categoria.id,
      });

      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos[0]?.categoriaId).toBe(categoria.id);
    });

    it('el índice único (origenRecurrenteId, periodoId) impide una segunda materialización manual para el mismo periodo', async () => {
      const tenantId = await tenantNuevo();
      const recurrente = await crearGastoRecurrente({
        tenantId,
        descripcion: 'Gimnasio',
        montoValorMinimo: 30000n,
        moneda: 'MXN',
        frecuencia: 'quincenal',
      });
      const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));

      // Ya se materializó una vez al crear el periodo — un segundo
      // intento manual contra la misma pareja (origenRecurrenteId,
      // periodoId) debe chocar con el índice único parcial.
      await expect(
        conTenant(tenantId, async (tx) => {
          const { gastos } = await import('../../src/db/schema/gastos.js');
          const { registrarMovimientoTx } = await import('../../src/modulos/ledger/registrar-movimiento.js');
          const { movimientoId } = await registrarMovimientoTx(tx, {
            tenantId,
            tipo: 'gasto',
            moneda: 'MXN',
            fechaEfectiva: periodo.fechaInicio,
            partidas: [
              { cuentaId: periodo.cuentaId, montoValorMinimo: -30000n },
              { cuentaId: null, montoValorMinimo: 30000n },
            ],
          });
          await tx.insert(gastos).values({ tenantId, periodoId: periodo.id, movimientoId, origenRecurrenteId: recurrente.id });
        })
      ).rejects.toThrow();
    });
  });

  describe('eliminarGastoRecurrente (pedido real: una renta duplicada que solo se podía pausar)', () => {
    it('deja de listarse y ya no se cobra en las quincenas siguientes; lo ya cobrado se queda', async () => {
      const tenantId = await tenantNuevo();
      const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
      const renta = await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 500000n, moneda: 'MXN', frecuencia: 'quincenal', fechaReferencia: new Date('2026-08-01T00:00:00Z') });
      expect((await listarGastos(tenantId, p1.id)).datos).toHaveLength(1); // se cobró en la quincena activa

      await eliminarGastoRecurrente(tenantId, renta.id);

      expect(await listarGastosRecurrentes(tenantId)).toHaveLength(0);
      expect((await listarGastos(tenantId, p1.id)).datos).toHaveLength(1); // lo ya cobrado no se toca
      const p2 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-16T00:00:00Z'));
      expect((await listarGastos(tenantId, p2.id)).datos).toHaveLength(0); // ya no se vuelve a cobrar
    });

    it('un recurrente eliminado ya no se puede editar ni volver a eliminar', async () => {
      const tenantId = await tenantNuevo();
      const renta = await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 500000n, moneda: 'MXN', frecuencia: 'quincenal' });
      await eliminarGastoRecurrente(tenantId, renta.id);

      await expect(actualizarGastoRecurrente({ tenantId, id: renta.id, activo: true })).rejects.toMatchObject({ codigo: 'RECURRENTE_NO_ENCONTRADO' });
      await expect(eliminarGastoRecurrente(tenantId, renta.id)).rejects.toMatchObject({ codigo: 'RECURRENTE_NO_ENCONTRADO' });
    });

    it('no puede eliminar el recurrente de otro tenant', async () => {
      const tenantA = await tenantNuevo();
      const tenantB = await tenantNuevo();
      const ajeno = await crearGastoRecurrente({ tenantId: tenantA, descripcion: 'Gimnasio', montoValorMinimo: 30000n, moneda: 'MXN', frecuencia: 'quincenal' });

      await expect(eliminarGastoRecurrente(tenantB, ajeno.id)).rejects.toMatchObject({ codigo: 'RECURRENTE_NO_ENCONTRADO' });
      expect(await listarGastosRecurrentes(tenantA)).toHaveLength(1);
    });
  });

  describe('editar un cobro ya aplicado (pedido real: "la renta bajó")', () => {
    async function conRentaCobrada() {
      const tenantId = await tenantNuevo();
      const hoy = new Date('2026-08-16T12:00:00Z');
      const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 1000000n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: hoy });
      await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 500000n, moneda: 'MXN', frecuencia: 'quincenal', fechaReferencia: hoy });
      const [cobro] = (await listarGastos(tenantId, periodo.id, { fechaReferencia: hoy })).datos;
      if (!cobro) throw new Error('setup: la renta no se cobró');
      return { tenantId, periodo, cobro, hoy };
    }

    it('el cobro corregido sigue siendo recurrente: marcado como automático y en "Recurrentes" del desglose', async () => {
      const { tenantId, periodo, cobro, hoy } = await conRentaCobrada();

      await editarGasto({ tenantId, gastoId: cobro.id, monto: 450000n, moneda: 'MXN', fechaEfectiva: cobro.fechaEfectiva, fechaReferencia: hoy });

      const vigentes = (await listarGastos(tenantId, periodo.id, { fechaReferencia: hoy })).datos.filter((g) => !g.revertido);
      expect(vigentes).toEqual([expect.objectContaining({ montoValorMinimo: 450000n, esRecurrente: true })]);
      const desglose = await obtenerDesglose(tenantId, periodo.id, hoy);
      expect(desglose.recurrentes.totalValorMinimo).toBe(450000n);
      expect(desglose.totalVariableValorMinimo).toBe(0n);
    });

    it('corregirlo no cuenta como "gastado hoy" (sigue siendo un cargo fijo, no algo que decidiste gastar hoy)', async () => {
      const { tenantId, cobro, hoy } = await conRentaCobrada();

      await editarGasto({ tenantId, gastoId: cobro.id, monto: 450000n, moneda: 'MXN', fechaEfectiva: cobro.fechaEfectiva, fechaReferencia: hoy });

      const disponible = await consultarDisponible(tenantId, hoy);
      expect(disponible?.estado === 'ok' && disponible.gastadoHoyValorMinimo).toBe(0n);
      expect(disponible?.estado === 'ok' && disponible.disponibleValorMinimo).toBe(550000n);
    });

    it('se puede corregir dos veces, y el índice de "un cobro por quincena" sigue protegiendo los cobros nuevos', async () => {
      const { tenantId, periodo, cobro, hoy } = await conRentaCobrada();

      const primera = await editarGasto({ tenantId, gastoId: cobro.id, monto: 450000n, moneda: 'MXN', fechaEfectiva: cobro.fechaEfectiva, fechaReferencia: hoy });
      await editarGasto({ tenantId, gastoId: primera.id, monto: 400000n, moneda: 'MXN', fechaEfectiva: cobro.fechaEfectiva, fechaReferencia: hoy });

      const vigentes = (await listarGastos(tenantId, periodo.id, { fechaReferencia: hoy })).datos.filter((g) => !g.revertido);
      expect(vigentes).toEqual([expect.objectContaining({ montoValorMinimo: 400000n, esRecurrente: true })]);
      expect((await obtenerDesglose(tenantId, periodo.id, hoy)).recurrentes.totalValorMinimo).toBe(400000n);
    });
  });
});
