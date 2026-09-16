import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { movimientos } from '../../src/db/schema/ledger.js';
import { recordatoriosEnviados } from '../../src/db/schema/recordatorios.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import {
  listarTenantIdsConRecordatoriosActivos,
  procesarRecordatorioDiarioDeTenant,
} from '../../src/modulos/notificaciones/enviar-recordatorios.js';
import { actualizarPreferenciasNotificaciones, obtenerPreferenciasNotificaciones } from '../../src/modulos/notificaciones/preferencias.js';
import { conTenant } from '../../src/shared/db.js';
import { fechaISO } from '../../src/shared/fechas.js';

describe('recordatorios por correo', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-recordatorios-${randomUUID()}`);
    return tenantId;
  }

  const HOY = new Date('2026-08-16T00:00:00Z'); // quincena 16-31 de agosto

  async function tenantConPeriodoEIngreso(monto = 5000n) {
    const tenantId = await tenantNuevo();
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: HOY });
    return { tenantId, periodo };
  }

  /** El resolver de correo nunca debe llamar a Supabase de verdad en tests — ver scripts/test-local.ts. */
  const correoDePrueba = async () => 'usuario@ejemplo.com';
  const sinCorreo = async () => null;

  /** Simula que ya se materializó actividad real (gasto/ingreso) en un instante dado — solo lo que `huboActividadEnVentanaTx` necesita ver. */
  async function insertarActividad(tenantId: string, fechaRegistro: Date) {
    return conTenant(tenantId, async (tx) => {
      await tx.insert(movimientos).values({ tenantId, tipo: 'gasto', moneda: 'MXN', fechaEfectiva: fechaISO(fechaRegistro), fechaRegistro });
    });
  }

  /** Inserta directamente una fila de "ya se mandó" con un creadoEn controlado — para armar escenarios de backoff sin esperar 3 días reales. */
  async function insertarRecordatorioEnviado(tenantId: string, fecha: string, creadoEn: Date) {
    return conTenant(tenantId, async (tx) => {
      await tx.insert(recordatoriosEnviados).values({ tenantId, fecha, tipo: 'diario', creadoEn });
    });
  }

  describe('procesarRecordatorioDiarioDeTenant', () => {
    it('sin periodo activo, no envía nada', async () => {
      const tenantId = await tenantNuevo();
      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);
      expect(resultado).toEqual({ tenantId, enviado: false, motivo: 'sin_periodo_activo_o_ingreso' });
    });

    it('periodo activo sin ingreso registrado, no envía nada (regla 5: nunca con datos incompletos)', async () => {
      const tenantId = await tenantNuevo();
      await crearPeriodo(tenantId, 'quincenal', HOY);
      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);
      expect(resultado).toEqual({ tenantId, enviado: false, motivo: 'sin_periodo_activo_o_ingreso' });
    });

    it('ya registró un gasto hoy, no envía nada (regla 2: se silencia sola)', async () => {
      const { tenantId, periodo } = await tenantConPeriodoEIngreso();
      await registrarGasto({ tenantId, periodoId: periodo.id, monto: 100n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: HOY });

      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);
      expect(resultado).toEqual({ tenantId, enviado: false, motivo: 'ya_registro_hoy' });
    });

    it('caso feliz: periodo activo, con ingreso, sin actividad hoy -> envía con la cifra accionable', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();

      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);

      expect(resultado.enviado).toBe(true);
      expect(resultado.tenantId).toBe(tenantId);
    });

    it('ya se mandó hoy (segunda llamada el mismo día), no envía dos veces', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();

      const primera = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);
      const segunda = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);

      expect(primera.enviado).toBe(true);
      expect(segunda).toEqual({ tenantId, enviado: false, motivo: 'ya_enviado' });
    });

    it('sin ninguna identidad con correo resuelto, no envía (pero sí reclama el día)', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();

      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, sinCorreo);

      expect(resultado).toEqual({ tenantId, enviado: false, motivo: 'sin_correo' });
    });

    it('backoff: 3 recordatorios seguidos sin actividad después bajan la cadencia (regla 3)', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();
      const dia13 = new Date('2026-08-13T00:00:00Z');
      const dia14 = new Date('2026-08-14T00:00:00Z');
      const dia15 = new Date('2026-08-15T00:00:00Z');
      await insertarRecordatorioEnviado(tenantId, '2026-08-13', dia13);
      await insertarRecordatorioEnviado(tenantId, '2026-08-14', dia14);
      await insertarRecordatorioEnviado(tenantId, '2026-08-15', dia15);
      // Ninguna actividad registrada en las 24h después de ninguno de los tres.

      // Hoy (16 de agosto) es apenas 1 día después del último envío (15) -> en backoff, no debe mandar todavía.
      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);

      expect(resultado).toEqual({ tenantId, enviado: false, motivo: 'en_backoff' });
    });

    it('backoff termina en cuanto pasan los días de espera desde el último envío ignorado', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();
      await insertarRecordatorioEnviado(tenantId, '2026-08-10', new Date('2026-08-10T00:00:00Z'));
      await insertarRecordatorioEnviado(tenantId, '2026-08-11', new Date('2026-08-11T00:00:00Z'));
      await insertarRecordatorioEnviado(tenantId, '2026-08-12', new Date('2026-08-12T00:00:00Z'));
      // Hoy (16) ya son 4 días después del último envío (12) -> pasó la espera de 3 días.

      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);

      expect(resultado.enviado).toBe(true);
    });

    it('si hubo actividad después de alguno de los últimos 3 envíos, no hay backoff (se resetea a diario)', async () => {
      const { tenantId } = await tenantConPeriodoEIngreso();
      const dia13 = new Date('2026-08-13T00:00:00Z');
      const dia14 = new Date('2026-08-14T00:00:00Z');
      const dia15 = new Date('2026-08-15T00:00:00Z');
      await insertarRecordatorioEnviado(tenantId, '2026-08-13', dia13);
      await insertarRecordatorioEnviado(tenantId, '2026-08-14', dia14);
      await insertarRecordatorioEnviado(tenantId, '2026-08-15', dia15);
      // Sí hubo actividad real unas horas después del envío del día 14.
      await insertarActividad(tenantId, new Date('2026-08-14T10:00:00Z'));

      const resultado = await procesarRecordatorioDiarioDeTenant(tenantId, HOY, correoDePrueba);

      expect(resultado.enviado).toBe(true);
    });
  });

  describe('listarTenantIdsConRecordatoriosActivos', () => {
    it('incluye un tenant nuevo (recibirRecordatorios=true por default)', async () => {
      const tenantId = await tenantNuevo();
      expect(await listarTenantIdsConRecordatoriosActivos()).toContain(tenantId);
    });

    it('excluye un tenant que desactivó los recordatorios', async () => {
      const tenantId = await tenantNuevo();
      await actualizarPreferenciasNotificaciones(tenantId, false);

      expect(await listarTenantIdsConRecordatoriosActivos()).not.toContain(tenantId);
    });
  });

  describe('preferencias', () => {
    it('un tenant nuevo recibe recordatorios por default', async () => {
      const tenantId = await tenantNuevo();
      expect(await obtenerPreferenciasNotificaciones(tenantId)).toEqual({ recibirRecordatorios: true });
    });

    it('se puede desactivar y reactivar', async () => {
      const tenantId = await tenantNuevo();

      await actualizarPreferenciasNotificaciones(tenantId, false);
      expect(await obtenerPreferenciasNotificaciones(tenantId)).toEqual({ recibirRecordatorios: false });

      await actualizarPreferenciasNotificaciones(tenantId, true);
      expect(await obtenerPreferenciasNotificaciones(tenantId)).toEqual({ recibirRecordatorios: true });
    });
  });
});
