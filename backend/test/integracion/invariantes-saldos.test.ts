import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { obtenerSaldoCuenta, registrarMovimientoTx } from '../../src/modulos/ledger/registrar-movimiento.js';
import { aportarAMeta, crearMeta, deshacerPagoMeta, pagarConMeta, retirarDeMeta } from '../../src/modulos/metas/metas.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';
import { conTenant } from '../../src/shared/db.js';

/**
 * Dinero que no existe: ninguna operación debe poder crearlo. Un gasto SÍ puede
 * sobregirar la quincena (ya ocurrió en la vida real, modelo-dominio.md §5); las
 * transferencias voluntarias (aportar, retirar, pagar con una meta, cargos a una
 * tarjeta) no. Estas pruebas fijan esa frontera.
 */
describe('invariantes de saldos', () => {
  const HOY = new Date('2026-08-01T00:00:00Z');

  async function tenantConIngreso(monto = 5000n) {
    const { tenantId } = await resolverOcrearIdentidad(`test-invariantes-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY });
    return { tenantId, periodo };
  }

  describe('metas: la base de datos rechaza sacarles más de lo que tienen (red de seguridad)', () => {
    it('un asiento que deja una meta en negativo se rechaza aunque la aplicación no lo haya validado', async () => {
      const { tenantId } = await tenantConIngreso();
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');

      await expect(
        conTenant(tenantId, (tx) =>
          registrarMovimientoTx(tx, {
            tenantId,
            tipo: 'pago_meta',
            moneda: 'MXN',
            fechaEfectiva: '2026-08-01',
            partidas: [
              { cuentaId: meta.cuentaId, montoValorMinimo: -100n },
              { cuentaId: null, montoValorMinimo: 100n },
            ],
          })
        )
      ).rejects.toThrow();
      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });

    it('sacar exactamente lo que hay sí se permite, y meter dinero nunca se rechaza', async () => {
      const { tenantId } = await tenantConIngreso();
      const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');
      const mover = (monto: bigint) =>
        conTenant(tenantId, (tx) =>
          registrarMovimientoTx(tx, {
            tenantId,
            tipo: 'aporte_meta',
            moneda: 'MXN',
            fechaEfectiva: '2026-08-01',
            partidas: [
              { cuentaId: meta.cuentaId, montoValorMinimo: monto },
              { cuentaId: null, montoValorMinimo: -monto },
            ],
          })
        );

      await mover(500n);
      await mover(-500n);

      expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(0n);
    });
  });

  it('una secuencia de aportes, retiros y pagos con una meta nunca la deja en negativo ni la quincena sin respaldo', async () => {
    const { tenantId, periodo } = await tenantConIngreso(5000n);
    const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');
    const movimientos = { tenantId, metaId: meta.id, moneda: 'MXN', fechaReferencia: HOY };

    await aportarAMeta({ ...movimientos, monto: 3000n });
    const pago = await pagarConMeta({ ...movimientos, monto: 1000n, motivo: 'Renta' });
    await retirarDeMeta({ ...movimientos, monto: 500n, motivo: 'Emergencia' });
    await deshacerPagoMeta(tenantId, meta.id, pago.id, HOY);
    await expect(retirarDeMeta({ ...movimientos, monto: 2600n, motivo: 'Demasiado' })).rejects.toMatchObject({ codigo: 'SALDO_META_INSUFICIENTE' });
    await expect(aportarAMeta({ ...movimientos, monto: 2600n })).rejects.toMatchObject({ codigo: 'APORTE_EXCEDE_DISPONIBLE' });

    expect(await obtenerSaldoCuenta(tenantId, meta.cuentaId)).toBe(2500n); // 3000 - 1000 - 500 + 1000
    expect(await obtenerSaldoCuenta(tenantId, periodo.cuentaId)).toBe(2500n); // 5000 - 3000 + 500
  });

  describe('tarjetas', () => {
    it('rechaza un número de plazos absurdo en vez de insertar millones de filas', async () => {
      const { tenantId } = await tenantConIngreso();
      const tarjeta = await crearTarjeta(tenantId, 'BBVA Oro', 100000n, 'MXN', 15, 20);
      const cargo = (numeroPlazos: number) =>
        registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion: 'Laptop', montoTotalValorMinimo: 1000n, moneda: 'MXN', numeroPlazos, fechaCompra: '2026-08-01' });

      await expect(cargo(1_000_000_000)).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(cargo(61)).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(cargo(24)).resolves.toBeDefined();
    });

    it('rechaza unos días para pagar fuera de rango', async () => {
      const { tenantId } = await tenantConIngreso();

      await expect(crearTarjeta(tenantId, 'BBVA', 100000n, 'MXN', 15, 91)).rejects.toMatchObject({ codigo: 'VALIDACION' });
      await expect(crearTarjeta(tenantId, 'BBVA', 100000n, 'MXN', 15, 90)).resolves.toBeDefined();
    });

    it('dos cargos simultáneos no pueden juntos pasar el límite de crédito', async () => {
      const { tenantId } = await tenantConIngreso();
      const tarjeta = await crearTarjeta(tenantId, 'BBVA Oro', 100000n, 'MXN', 15, 20);
      const cargo = (descripcion: string) =>
        registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion, montoTotalValorMinimo: 60000n, moneda: 'MXN', numeroPlazos: 1, fechaCompra: '2026-08-01' });

      const resultados = await Promise.allSettled([cargo('Laptop'), cargo('Celular')]);

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rechazado = resultados.find((r) => r.status === 'rejected');
      expect(rechazado).toMatchObject({ reason: { codigo: 'LIMITE_CREDITO_EXCEDIDO' } });
      expect(await obtenerSaldoCuenta(tenantId, tarjeta.cuentaId)).toBe(-60000n);
    });
  });
});
