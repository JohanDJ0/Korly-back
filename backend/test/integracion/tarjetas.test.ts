import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { periodos } from '../../src/db/schema/periodos.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada } from '../../src/modulos/categorias/categorias.js';
import { crearCuentaTx, obtenerSaldoCuenta } from '../../src/modulos/ledger/registrar-movimiento.js';
import { crearPeriodo, obtenerPeriodoActivo } from '../../src/modulos/periodos/crear-periodo.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { obtenerResumen } from '../../src/modulos/cierre/generar-resumen.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { crearTarjeta, listarTarjetas } from '../../src/modulos/tarjetas/tarjetas.js';
import { listarCargosTarjeta, registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { conTenant } from '../../src/shared/db.js';

// Toda la quincena de prueba vive en esta ventana.
const HOY_DE_PRUEBA = new Date('2026-08-05T00:00:00Z');

describe('tarjetas de crédito y MSI', () => {
  async function tenantNuevo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-tarjetas-${randomUUID()}`);
    return tenantId;
  }

  async function tarjetaDePrueba(tenantId: string, limiteCredito = 1000000n) {
    // Corte día 15, 20 días para pagar — compras del 1-15 de agosto vencen el 4 de septiembre.
    return crearTarjeta(tenantId, 'BBVA Oro', limiteCredito, 'MXN', 15, 20);
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

  describe('crearTarjeta', () => {
    it('rechaza un límite de crédito no positivo', async () => {
      const tenantId = await tenantNuevo();
      await expect(crearTarjeta(tenantId, 'BBVA', 0n, 'MXN', 15, 20)).rejects.toThrow(/positivo/);
    });

    it('rechaza un día de corte fuera de rango', async () => {
      const tenantId = await tenantNuevo();
      await expect(crearTarjeta(tenantId, 'BBVA', 100000n, 'MXN', 32, 20)).rejects.toThrow(/diaCorte/);
    });

    it('crea una tarjeta con crédito disponible igual al límite completo', async () => {
      const tenantId = await tenantNuevo();
      await crearTarjeta(tenantId, 'BBVA Oro', 1000000n, 'MXN', 15, 20);

      const tarjetas = await listarTarjetas(tenantId);
      expect(tarjetas).toHaveLength(1);
      expect(tarjetas[0]?.saldoValorMinimo).toBe(0n);
      expect(tarjetas[0]?.creditoDisponibleValorMinimo).toBe(1000000n);
    });
  });

  describe('registrarCargoTarjeta', () => {
    it('rechaza una tarjeta que no existe (BOLA)', async () => {
      const tenantId = await tenantNuevo();
      await expect(
        registrarCargoTarjeta({ tenantId, tarjetaId: randomUUID(), descripcion: 'Laptop', montoTotalValorMinimo: 100000n, moneda: 'MXN', numeroPlazos: 1 })
      ).rejects.toMatchObject({ codigo: 'TARJETA_NO_ENCONTRADA' });
    });

    it('rechaza una tarjeta de otro tenant (BOLA)', async () => {
      const tenantId = await tenantNuevo();
      const otroTenantId = await tenantNuevo();
      const tarjetaAjena = await tarjetaDePrueba(otroTenantId);

      await expect(
        registrarCargoTarjeta({ tenantId, tarjetaId: tarjetaAjena.id, descripcion: 'Laptop', montoTotalValorMinimo: 100000n, moneda: 'MXN', numeroPlazos: 1 })
      ).rejects.toMatchObject({ codigo: 'TARJETA_NO_ENCONTRADA' });
    });

    it('bloquea un cargo que excede el crédito disponible', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId, 100000n);

      await expect(
        registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion: 'TV', montoTotalValorMinimo: 100001n, moneda: 'MXN', numeroPlazos: 1 })
      ).rejects.toMatchObject({ codigo: 'LIMITE_CREDITO_EXCEDIDO' });
    });

    it('un cargo exactamente igual al crédito disponible sí se permite', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId, 100000n);

      await expect(
        registrarCargoTarjeta({ tenantId, tarjetaId: tarjeta.id, descripcion: 'TV', montoTotalValorMinimo: 100000n, moneda: 'MXN', numeroPlazos: 1 })
      ).resolves.toBeDefined();
    });

    it('sube la deuda de la tarjeta de inmediato, sin tocar ningún periodo', async () => {
      const tenantId = await tenantNuevo();
      await crearPeriodo(tenantId, 'quincenal', HOY_DE_PRUEBA);
      const tarjeta = await tarjetaDePrueba(tenantId);

      await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Laptop',
        montoTotalValorMinimo: 240000n,
        moneda: 'MXN',
        numeroPlazos: 12,
        fechaCompra: '2026-08-05',
      });

      const saldoTarjeta = await obtenerSaldoCuenta(tenantId, tarjeta.cuentaId);
      expect(saldoTarjeta).toBe(-240000n);

      const periodoActivo = await obtenerPeriodoActivo(tenantId, HOY_DE_PRUEBA);
      const saldoPeriodo = await obtenerSaldoCuenta(tenantId, periodoActivo!.cuentaId);
      expect(saldoPeriodo).toBe(0n); // el cargo no tocó el periodo.
    });

    it('reparte el monto en mensualidades con fechas de vencimiento crecientes', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId);

      const resultado = await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Laptop',
        montoTotalValorMinimo: 240000n,
        moneda: 'MXN',
        numeroPlazos: 12,
        fechaCompra: '2026-08-05',
      });

      expect(resultado.mensualidades).toHaveLength(12);
      expect(resultado.mensualidades[0]?.montoValorMinimo).toBe(20000n);
      expect(resultado.mensualidades[0]?.fechaVencimiento).toBe('2026-09-04');
      expect(resultado.mensualidades[11]?.fechaVencimiento).toBe('2027-08-04');
      // Fechas estrictamente crecientes.
      for (let i = 1; i < resultado.mensualidades.length; i++) {
        expect(resultado.mensualidades[i]!.fechaVencimiento > resultado.mensualidades[i - 1]!.fechaVencimiento).toBe(true);
      }
    });

    it('asigna la categoría cuando se especifica', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId);
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Tecnología');

      const cargoId = (
        await registrarCargoTarjeta({
          tenantId,
          tarjetaId: tarjeta.id,
          descripcion: 'Laptop',
          montoTotalValorMinimo: 100000n,
          moneda: 'MXN',
          numeroPlazos: 1,
          categoriaId: categoria.id,
        })
      ).id;

      const cargos = await listarCargosTarjeta(tenantId, tarjeta.id);
      expect(cargos.find((c) => c.id === cargoId)?.categoriaId).toBe(categoria.id);
    });
  });

  describe('materialización de mensualidades al activar un periodo', () => {
    it('una mensualidad que vence dentro del periodo activo se materializa como pago_tarjeta', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId);
      // Compra el 20 de julio (antes del corte del 15... en realidad
      // después: corte día 15, compra día 20 -> le toca el corte de
      // agosto -> vencimiento 4 de septiembre, que SÍ cae en la
      // quincena 1-15 de septiembre.
      await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Refrigerador',
        montoTotalValorMinimo: 900000n,
        moneda: 'MXN',
        numeroPlazos: 3,
        fechaCompra: '2026-07-20',
      });

      // Periodo de julio (donde se hizo la compra) — la primera
      // mensualidad vence hasta septiembre, así que aquí NO se materializa.
      const periodoJulio = await crearPeriodo(tenantId, 'quincenal', new Date('2026-07-20T00:00:00Z'));
      const saldoPeriodoJulio = await obtenerSaldoCuenta(tenantId, periodoJulio.cuentaId);
      expect(saldoPeriodoJulio).toBe(0n);

      // Periodo de septiembre (donde vence la primera mensualidad).
      const periodoSeptiembre = await insertarBorrador(tenantId, '2026-09-01', '2026-09-15');
      const activo = await obtenerPeriodoActivo(tenantId, new Date('2026-09-05T00:00:00Z'));
      expect(activo?.id).toBe(periodoSeptiembre.id);

      const saldoPeriodoSeptiembre = await obtenerSaldoCuenta(tenantId, periodoSeptiembre.cuentaId);
      expect(saldoPeriodoSeptiembre).toBe(-300000n); // una mensualidad de 900000/3.

      const saldoTarjeta = await obtenerSaldoCuenta(tenantId, tarjeta.cuentaId);
      expect(saldoTarjeta).toBe(-600000n); // 900000 de deuda - 300000 ya pagado.

      const cargos = await listarCargosTarjeta(tenantId, tarjeta.id);
      const mensualidades = cargos[0]!.mensualidades;
      expect(mensualidades[0]?.pagado).toBe(true);
      expect(mensualidades[1]?.pagado).toBe(false);
      expect(mensualidades[2]?.pagado).toBe(false);
    });

    it('un periodo en borrador (ya hay uno activo) no materializa todavía', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId);
      await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Bicicleta',
        montoTotalValorMinimo: 300000n,
        moneda: 'MXN',
        numeroPlazos: 1,
        fechaCompra: '2026-08-05', // vence 2026-09-04
      });

      await crearPeriodo(tenantId, 'quincenal', HOY_DE_PRUEBA); // activo, 1-15 agosto
      const borrador = await crearPeriodo(tenantId, 'quincenal', HOY_DE_PRUEBA); // se crea en borrador
      expect(borrador.estado).toBe('borrador');

      const saldoTarjeta = await obtenerSaldoCuenta(tenantId, tarjeta.cuentaId);
      expect(saldoTarjeta).toBe(-300000n); // nada materializado todavía.
    });

    it('el pago de tarjeta cuenta como gasto en el resumen del periodo', async () => {
      const tenantId = await tenantNuevo();
      const tarjeta = await tarjetaDePrueba(tenantId);
      await registrarCargoTarjeta({
        tenantId,
        tarjetaId: tarjeta.id,
        descripcion: 'Bicicleta',
        montoTotalValorMinimo: 300000n,
        moneda: 'MXN',
        numeroPlazos: 1,
        fechaCompra: '2026-08-05', // vence 2026-09-04
      });

      const periodoSeptiembre = await insertarBorrador(tenantId, '2026-09-01', '2026-09-15');
      // Fuerza la promoción a activo (donde se materializa el pago) ANTES
      // de registrar el ingreso — registrarIngreso exige un periodo ya activo.
      await obtenerPeriodoActivo(tenantId, new Date('2026-09-05T00:00:00Z'));
      await registrarIngreso({
        tenantId,
        periodoId: periodoSeptiembre.id,
        monto: 1000000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-09-01',
        fechaReferencia: new Date('2026-09-05T00:00:00Z'),
      });

      await cerrarPeriodoManualmente(tenantId, periodoSeptiembre.id, new Date('2026-09-16T00:00:00Z'));
      const resumen = await obtenerResumen(tenantId, periodoSeptiembre.id);

      expect(resumen?.totalGastadoValorMinimo).toBe(300000n);
      expect(resumen?.totalIngresosValorMinimo).toBe(1000000n);
      expect(resumen?.sobranteValorMinimo).toBe(700000n);
    });

    it('aislamiento entre tenants: la mensualidad de un tenant no se materializa en el periodo de otro', async () => {
      const tenantA = await tenantNuevo();
      const tenantB = await tenantNuevo();
      const tarjetaA = await tarjetaDePrueba(tenantA);
      await registrarCargoTarjeta({
        tenantId: tenantA,
        tarjetaId: tarjetaA.id,
        descripcion: 'Bicicleta',
        montoTotalValorMinimo: 300000n,
        moneda: 'MXN',
        numeroPlazos: 1,
        fechaCompra: '2026-08-05',
      });

      const periodoB = await crearPeriodo(tenantB, 'quincenal', new Date('2026-09-05T00:00:00Z'));
      const saldoPeriodoB = await obtenerSaldoCuenta(tenantB, periodoB.cuentaId);
      expect(saldoPeriodoB).toBe(0n);
    });
  });

  describe('listarCargosTarjeta', () => {
    it('rechaza una tarjeta de otro tenant (BOLA)', async () => {
      const tenantId = await tenantNuevo();
      const otroTenantId = await tenantNuevo();
      const tarjetaAjena = await tarjetaDePrueba(otroTenantId);

      await expect(listarCargosTarjeta(tenantId, tarjetaAjena.id)).rejects.toMatchObject({ codigo: 'TARJETA_NO_ENCONTRADA' });
    });
  });
});
