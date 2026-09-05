import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { periodos } from '../../src/db/schema/periodos.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCuentaTx, obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { crearPeriodo, obtenerPeriodoActivo, obtenerPeriodoPorId } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { decidirSobrante } from '../../src/modulos/cierre/decidir-sobrante.js';
import { conTenant } from '../../src/shared/db.js';

/**
 * Promoción de borrador → activo (modelo-dominio.md §3: "Transición a
 * Activo: automática al llegar la fecha de inicio"). `crearPeriodo` hoy
 * no puede producir un borrador con una ventana futura genuina (ver
 * README, "Higiene de borradores") — siempre duplica el rango del
 * periodo activo al momento de crearse. Para probar la promoción en
 * condiciones realistas (no solo el caso degenerado de duplicado),
 * estos tests insertan un borrador directamente con las fechas que
 * quieren ejercitar, en vez de pasar por `crearPeriodo`.
 */
describe('promoción de borrador a activo', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-promocion-${randomUUID()}`);
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

  async function estadoDe(tenantId: string, periodoId: string) {
    const [fila] = await conTenant(tenantId, (tx) =>
      tx.select({ estado: periodos.estado }).from(periodos).where(and(eq(periodos.tenantId, tenantId), eq(periodos.id, periodoId)))
    );
    return fila?.estado;
  }

  it('promueve un borrador cuya ventana contiene hoy, cuando no hay periodo activo', async () => {
    const tenantId = await tenantNuevo();
    const borrador = await insertarBorrador(tenantId, '2026-08-16', '2026-08-31');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));

    expect(activo?.id).toBe(borrador.id);
    expect(activo?.estado).toBe('activo');
  });

  it('NO promueve un borrador cuya ventana todavía no llega', async () => {
    const tenantId = await tenantNuevo();
    await insertarBorrador(tenantId, '2026-09-01', '2026-09-15');

    expect(await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'))).toBeNull();
  });

  it('NO promueve un borrador cuya ventana ya pasó por completo (evita el churn)', async () => {
    const tenantId = await tenantNuevo();
    const borrador = await insertarBorrador(tenantId, '2026-08-01', '2026-08-15');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));

    expect(activo).toBeNull();
    // Queda huérfano, no se toca ni se cierra ni se promueve.
    expect(await estadoDe(tenantId, borrador.id)).toBe('borrador');
  });

  it('al cerrar perezosamente el periodo vencido, promueve el borrador que ya le toca, en la misma operación', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: p1.id,
      monto: 500n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    const borrador = await insertarBorrador(tenantId, '2026-08-16', '2026-08-31');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));

    expect(activo?.id).toBe(borrador.id);

    const p1Actualizado = await obtenerPeriodoPorId(tenantId, p1.id, new Date('2026-08-20T00:00:00Z'));
    expect(p1Actualizado?.estado).toBe('cerrado');
  });

  it('el borrador promovido reclama arrastres ya decididos como arrastrar', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    await registrarIngreso({
      tenantId,
      periodoId: p1.id,
      monto: 1000n,
      moneda: 'MXN',
      fechaEfectiva: '2026-08-01',
      fechaReferencia: new Date('2026-08-01T00:00:00Z'),
    });
    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));
    await decidirSobrante(tenantId, p1.id, 'arrastrar');

    const borrador = await insertarBorrador(tenantId, '2026-08-16', '2026-08-31');
    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));

    expect(activo?.id).toBe(borrador.id);
    expect(await obtenerSaldoCuenta(tenantId, borrador.cuentaId)).toBe(1000n);
  });

  it('con dos borradores candidatos, promueve el de fechaInicio más próxima', async () => {
    const tenantId = await tenantNuevo();
    const masTemprano = await insertarBorrador(tenantId, '2026-08-10', '2026-08-25');
    const masTarde = await insertarBorrador(tenantId, '2026-08-15', '2026-08-30');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));

    expect(activo?.id).toBe(masTemprano.id);
    expect(await estadoDe(tenantId, masTarde.id)).toBe('borrador');
  });

  it('cerrarPeriodoManualmente no promueve por sí mismo; el siguiente toque sí', async () => {
    const tenantId = await tenantNuevo();
    const p1 = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    const borrador = await insertarBorrador(tenantId, '2026-08-16', '2026-08-31');

    await cerrarPeriodoManualmente(tenantId, p1.id, new Date('2026-08-10T00:00:00Z'));
    expect(await estadoDe(tenantId, borrador.id)).toBe('borrador');

    const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-08-20T00:00:00Z'));
    expect(activo?.id).toBe(borrador.id);
  });
});
