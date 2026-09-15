import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearPeriodo, obtenerPeriodoPorId } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { obtenerResumen } from '../../src/modulos/cierre/generar-resumen.js';
import { eliminarGasto, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { eliminarIngreso, registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { aportarAMeta, crearMeta } from '../../src/modulos/metas/metas.js';
import { actualizarGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';

const ID_MALFORMADO = 'esto-no-es-un-uuid';
const HOY = new Date('2026-08-05T00:00:00Z');

/**
 * Hallazgo real del pase de QA/UX: un id que no tiene forma de UUID
 * llegaba directo a Postgres, que rechazaba la consulta entera con
 * "invalid input syntax for type uuid" — un error que no es
 * `ErrorDominio`, así que el manejador global lo convertía en un 500
 * genérico en vez del mismo "no encontrado" que ya da un UUID bien
 * formado pero inexistente (ver shared/validacion.ts). Cada caso aquí
 * es un punto de entrada real que antes de este fix reventaba con un
 * error de Postgres sin capturar.
 */
describe('ids malformados no producen un 500', () => {
  async function tenantConPeriodo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-ids-malformados-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY);
    return { tenantId, periodo };
  }

  it('obtenerPeriodoPorId devuelve null, no lanza', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(obtenerPeriodoPorId(tenantId, ID_MALFORMADO)).resolves.toBeNull();
  });

  it('cerrarPeriodoManualmente lanza PERIODO_NO_ENCONTRADO', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(cerrarPeriodoManualmente(tenantId, ID_MALFORMADO)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('obtenerResumen devuelve null, no lanza', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(obtenerResumen(tenantId, ID_MALFORMADO)).resolves.toBeNull();
  });

  it('decidirSobrante con un periodoId malformado lanza PERIODO_NO_ENCONTRADO', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(decidirSobrante(tenantId, ID_MALFORMADO, 'arrastrar')).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('decidirSobrante con un metaId malformado lanza META_NO_ENCONTRADA', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
    await cerrarPeriodoManualmente(tenantId, periodo.id, HOY);

    await expect(decidirSobrante(tenantId, periodo.id, 'ahorrar', ID_MALFORMADO)).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
  });

  it('eliminarGasto lanza GASTO_NO_ENCONTRADO', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(eliminarGasto({ tenantId, gastoId: ID_MALFORMADO, fechaReferencia: HOY })).rejects.toMatchObject({ codigo: 'GASTO_NO_ENCONTRADO' });
  });

  it('registrarGasto con una categoriaId malformada lanza CATEGORIA_NO_ENCONTRADA', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    await expect(
      registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        categoriaId: ID_MALFORMADO,
        fechaReferencia: HOY,
      })
    ).rejects.toMatchObject({ codigo: 'CATEGORIA_NO_ENCONTRADA' });
  });

  it('eliminarIngreso lanza INGRESO_NO_ENCONTRADO', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(eliminarIngreso({ tenantId, ingresoId: ID_MALFORMADO, fechaReferencia: HOY })).rejects.toMatchObject({
      codigo: 'INGRESO_NO_ENCONTRADO',
    });
  });

  it('aportarAMeta con un metaId malformado lanza META_NO_ENCONTRADA', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(
      aportarAMeta({ tenantId, metaId: ID_MALFORMADO, monto: 100n, moneda: 'MXN', fechaReferencia: HOY })
    ).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
  });

  it('crearMeta seguido de un metaId malformado en otra operación no se confunde con la meta real', async () => {
    const { tenantId } = await tenantConPeriodo();
    const meta = await crearMeta(tenantId, 'Viaje', 10000n, 'MXN');
    expect(meta.id).not.toBe(ID_MALFORMADO);
    await expect(
      aportarAMeta({ tenantId, metaId: ID_MALFORMADO, monto: 100n, moneda: 'MXN', fechaReferencia: HOY })
    ).rejects.toMatchObject({ codigo: 'META_NO_ENCONTRADA' });
  });

  it('actualizarGastoRecurrente lanza RECURRENTE_NO_ENCONTRADO', async () => {
    const { tenantId } = await tenantConPeriodo();
    await expect(actualizarGastoRecurrente({ tenantId, id: ID_MALFORMADO, activo: false })).rejects.toMatchObject({
      codigo: 'RECURRENTE_NO_ENCONTRADO',
    });
  });
});
