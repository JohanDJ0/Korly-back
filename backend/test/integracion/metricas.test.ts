import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { recordatoriosEnviados } from '../../src/db/schema/recordatorios.js';
import { tenants } from '../../src/db/schema/tenants.js';
import { registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { leerDatosMetricas } from '../../src/modulos/metricas/leer-datos.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cancelarAvisoPro, solicitarAvisoPro } from '../../src/modulos/suscripciones/suscripciones.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';
import { conTenant } from '../../src/shared/db.js';
import { dbAdmin } from '../../src/shared/db-admin.js';

/**
 * La base de pruebas es compartida con las demás suites, así que cada
 * prueba fija el `creado_en` de SUS tenants en un día propio (años que
 * ninguna otra suite usa) y consulta solo ese día con `desde`/`hasta`:
 * así la cohorte es exactamente la que se sembró.
 */
describe('leerDatosMetricas', () => {
  async function tenantEn(instanteDeAlta: string) {
    const { tenantId } = await resolverOcrearIdentidad(`test-metricas-${randomUUID()}`);
    await dbAdmin.update(tenants).set({ creadoEn: new Date(instanteDeAlta) }).where(eq(tenants.id, tenantId));
    return tenantId;
  }

  const HOY = new Date('2031-03-01T18:00:00Z');

  async function conPeriodoEIngreso(tenantId: string) {
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2031-03-01', fechaReferencia: HOY });
    return periodo;
  }

  it('la cohorte se acota por día de México: 05:59:59 UTC es todavía el día anterior, 06:00:00 UTC ya es el siguiente', async () => {
    const dentro = await tenantEn('2031-03-02T05:59:59Z'); // 23:59:59 del 1 de marzo en México
    const fuera = await tenantEn('2031-03-02T06:00:00Z'); // 00:00:00 del 2 de marzo

    const cohorte = await leerDatosMetricas({ desde: '2031-03-01', hasta: '2031-03-02', ahora: HOY });

    expect(cohorte).toHaveLength(1);
    // Se distingue por la fecha de alta, porque el reporte no expone ids.
    expect(cohorte[0]?.altaEn.toISOString()).toBe('2031-03-02T05:59:59.000Z');
    expect(dentro).not.toBe(fuera);
  });

  it('un gasto capturado a mano cuenta como captura; el que materializó un recurrente no', async () => {
    const manual = await tenantEn('2032-03-01T12:00:00Z');
    const periodoManual = await conPeriodoEIngreso(manual);
    await registrarGasto({ tenantId: manual, periodoId: periodoManual.id, monto: 5000n, moneda: 'MXN', fechaEfectiva: '2031-03-01', fechaReferencia: HOY });

    const automatico = await tenantEn('2032-03-01T12:30:00Z');
    await crearPeriodo(automatico, 'quincenal', HOY);
    await crearGastoRecurrente({ tenantId: automatico, descripcion: 'Netflix', montoValorMinimo: 21900n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 10, fechaReferencia: HOY });

    const datos = await leerDatosMetricas({ desde: '2032-03-01', hasta: '2032-03-02', ahora: HOY });

    const conCaptura = datos.filter((d) => d.capturas.length > 0);
    expect(datos).toHaveLength(2);
    expect(conCaptura).toHaveLength(1); // solo el manual; el gasto del recurrente existe pero no es una captura
    expect(conCaptura[0]?.tienePeriodo).toBe(true);
    expect(conCaptura[0]?.tieneIngreso).toBe(true);
    expect(datos.find((d) => d.capturas.length === 0)?.tieneIngreso).toBe(false);
  });

  it('un cargo de tarjeta cuenta como captura', async () => {
    const tenantId = await tenantEn('2033-03-01T12:00:00Z');
    const tarjeta = await crearTarjeta(tenantId, 'BBVA', 1000000n, 'MXN', 5, 10);
    await registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion: 'Laptop', montoTotalValorMinimo: 20000n, moneda: 'MXN', numeroPlazos: 1, fechaCompra: '2031-03-01' });

    const [dato] = await leerDatosMetricas({ desde: '2033-03-01', hasta: '2033-03-02', ahora: HOY });

    expect(dato?.capturas).toHaveLength(1);
  });

  it('cuenta los recordatorios de los últimos 7 días y no los más viejos', async () => {
    const tenantId = await tenantEn('2034-03-01T12:00:00Z');
    const ahora = new Date('2034-03-10T18:00:00Z');
    await conTenant(tenantId, async (tx) => {
      await tx.insert(recordatoriosEnviados).values([
        { tenantId, fecha: '2034-03-09', tipo: 'diario', creadoEn: new Date('2034-03-09T02:00:00Z') },
        { tenantId, fecha: '2034-03-05', tipo: 'diario', creadoEn: new Date('2034-03-05T02:00:00Z') },
        { tenantId, fecha: '2034-03-01', tipo: 'diario', creadoEn: new Date('2034-03-01T02:00:00Z') }, // hace 9 días
      ]);
    });

    const [dato] = await leerDatosMetricas({ desde: '2034-03-01', hasta: '2034-03-02', ahora });

    expect(dato?.recordatoriosEnviadosUltimos7Dias).toBe(2);
  });

  it('minimización de datos: cada usuario son solo banderas, fechas y conteos — nada que identifique a alguien ni sus montos', async () => {
    await tenantEn('2035-03-01T12:00:00Z');

    const [dato] = await leerDatosMetricas({ desde: '2035-03-01', hasta: '2035-03-02', ahora: HOY });

    expect(Object.keys(dato ?? {}).sort()).toEqual(
      ['altaEn', 'capturas', 'estadoSuscripcion', 'pidioAvisoPro', 'plan', 'recibirRecordatorios', 'recordatoriosEnviadosUltimos7Dias', 'tieneIngreso', 'tienePeriodo'].sort()
    );
  });

  it('marca a quien pidió que le avisemos cuando Pro exista, y deja de marcarlo si lo cancela', async () => {
    const tenantId = await tenantEn('2036-03-01T12:00:00Z');
    const leer = async () => (await leerDatosMetricas({ desde: '2036-03-01', hasta: '2036-03-02', ahora: HOY }))[0]?.pidioAvisoPro;

    expect(await leer()).toBe(false);
    await solicitarAvisoPro(tenantId);
    expect(await leer()).toBe(true);
    await cancelarAvisoPro(tenantId);
    expect(await leer()).toBe(false);
  });
});
