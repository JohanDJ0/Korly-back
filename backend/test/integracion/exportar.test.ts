import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tenants } from '../../src/db/schema/tenants.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada } from '../../src/modulos/categorias/categorias.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { registrarIngreso, editarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { registrarGasto, editarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { exportarGastosCsv, exportarIngresosCsv } from '../../src/modulos/exportar/exportar.js';
import { conTenant } from '../../src/shared/db.js';

// Toda la quincena de prueba vive en esta ventana — cualquier llamada
// que resuelva el periodo (registrar/editar) necesita una
// `fechaReferencia` dentro de ['2026-08-01', '2026-08-15'], si no el
// cierre perezoso (obtenerPeriodoPorIdTx) la cierra contra la fecha
// real del sistema, bien pasado agosto de 2026.
const HOY_DE_PRUEBA = new Date('2026-08-05T00:00:00Z');

describe('exportar a CSV', () => {
  /**
   * La exportación es una función de Korly Pro (documento-maestro-v2.md
   * §9.2) — todo este archivo prueba el CSV en sí, no el gate, así que
   * el tenant de prueba ya viene en Pro. El gate propio se prueba
   * aparte, en su propio describe, con un tenant free explícito.
   */
  async function tenantConPeriodo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-exportar-${randomUUID()}`);
    await conTenant(tenantId, (tx) => tx.update(tenants).set({ plan: 'pro' }).where(eq(tenants.id, tenantId)));
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-01T00:00:00Z'));
    return { tenantId, periodo };
  }

  describe('exportarGastosCsv', () => {
    it('sin ningún gasto, devuelve solo el encabezado', async () => {
      const { tenantId } = await tenantConPeriodo();
      const csv = await exportarGastosCsv(tenantId);
      expect(csv).toBe('fecha,monto,moneda,categoria,nota,revertido,periodo_inicio,periodo_fin\r\n');
    });

    it('incluye un gasto con el monto positivo, categoría y nota', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Antojitos');
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 15050n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        nota: 'Tacos',
        categoriaId: categoria.id,
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarGastosCsv(tenantId);
      const lineas = csv.trim().split('\r\n');
      expect(lineas).toHaveLength(2);
      expect(lineas[1]).toBe('2026-08-03,150.50,MXN,Antojitos,Tacos,false,2026-08-01,2026-08-15');
    });

    it('un gasto sin categoría ni nota deja esas columnas vacías', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarGastosCsv(tenantId);
      expect(csv.trim().split('\r\n')[1]).toBe('2026-08-03,10.00,MXN,,,false,2026-08-01,2026-08-15');
    });

    it('un gasto ya editado marca el original como revertido=true y agrega el corregido', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      const gasto = await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await editarGasto({
        tenantId,
        gastoId: gasto.id,
        monto: 2000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-05T00:00:00Z'),
      });

      const csv = await exportarGastosCsv(tenantId);
      const lineas = csv.trim().split('\r\n').slice(1);
      expect(lineas).toHaveLength(2);
      expect(lineas.find((l) => l.startsWith('2026-08-03'))).toContain(',true,');
      expect(lineas.find((l) => l.startsWith('2026-08-05'))).toContain(',false,');
    });

    it('escapa una nota con comas y comillas', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        nota: 'Cena, con "amigos"',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarGastosCsv(tenantId);
      expect(csv).toContain('"Cena, con ""amigos"""');
    });

    it('filtra por rango de fechas (desde/hasta) sobre fechaEfectiva', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-02',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await registrarGasto({
        tenantId,
        periodoId: periodo.id,
        monto: 2000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-10',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarGastosCsv(tenantId, { desde: '2026-08-05', hasta: '2026-08-15' });
      const lineas = csv.trim().split('\r\n').slice(1);
      expect(lineas).toHaveLength(1);
      expect(lineas[0]).toContain('2026-08-10');
    });

    it('aislamiento entre tenants: no incluye gastos de otro tenant', async () => {
      const { tenantId: tenantA } = await tenantConPeriodo();
      const { tenantId: tenantB, periodo: periodoB } = await tenantConPeriodo();
      await registrarGasto({
        tenantId: tenantB,
        periodoId: periodoB.id,
        monto: 1000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-03',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarGastosCsv(tenantA);
      expect(csv).toBe('fecha,monto,moneda,categoria,nota,revertido,periodo_inicio,periodo_fin\r\n');
    });
  });

  describe('exportarIngresosCsv', () => {
    it('incluye un ingreso con el monto positivo', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 800000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        nota: 'Quincena',
        fechaReferencia: HOY_DE_PRUEBA,
      });

      const csv = await exportarIngresosCsv(tenantId);
      const lineas = csv.trim().split('\r\n');
      expect(lineas).toHaveLength(2);
      expect(lineas[1]).toBe('2026-08-01,8000.00,MXN,Quincena,false,2026-08-01,2026-08-15');
    });

    it('un ingreso editado marca el original como revertido=true', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      const ingreso = await registrarIngreso({
        tenantId,
        periodoId: periodo.id,
        monto: 800000n,
        moneda: 'MXN',
        fechaEfectiva: '2026-08-01',
        fechaReferencia: HOY_DE_PRUEBA,
      });
      await editarIngreso({
        tenantId,
        ingresoId: ingreso.id,
        monto: 850000n,
        moneda: 'MXN',
        fechaReferencia: new Date('2026-08-02T00:00:00Z'),
      });

      const csv = await exportarIngresosCsv(tenantId);
      const lineas = csv.trim().split('\r\n').slice(1);
      expect(lineas.find((l) => l.startsWith('2026-08-01'))).toContain(',true,');
      expect(lineas.find((l) => l.startsWith('2026-08-02'))).toContain(',false,');
    });
  });

  describe('gate de plan (documento-maestro-v2.md §9.2: exportación es función de Pro)', () => {
    it('plan free: rechaza exportar gastos', async () => {
      const { tenantId } = await resolverOcrearIdentidad(`test-exportar-${randomUUID()}`);
      await expect(exportarGastosCsv(tenantId)).rejects.toMatchObject({ codigo: 'FUNCION_PRO' });
    });

    it('plan free: rechaza exportar ingresos', async () => {
      const { tenantId } = await resolverOcrearIdentidad(`test-exportar-${randomUUID()}`);
      await expect(exportarIngresosCsv(tenantId)).rejects.toMatchObject({ codigo: 'FUNCION_PRO' });
    });
  });
});
