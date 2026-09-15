import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { crearCategoriaPersonalizada } from '../../src/modulos/categorias/categorias.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { listarGastos } from '../../src/modulos/gastos/registrar-gasto.js';
import { listarIngresos } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { importarGastosCsv, importarIngresosCsv } from '../../src/modulos/importar/importar.js';

// Toda la quincena de prueba vive en esta ventana — cualquier llamada
// que resuelva el periodo necesita una fecha de referencia dentro de
// ['2026-08-01', '2026-08-15'], si no el cierre perezoso la cierra
// contra la fecha real del sistema.
const HOY_DE_PRUEBA = new Date('2026-08-05T00:00:00Z');

describe('importar desde CSV', () => {
  async function tenantConPeriodoActivo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-importar-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY_DE_PRUEBA);
    return { tenantId, periodo };
  }

  describe('importarGastosCsv', () => {
    it('rechaza un periodo que no existe', async () => {
      const { tenantId } = await tenantConPeriodoActivo();
      await expect(importarGastosCsv(tenantId, 'id-inexistente', 'fecha,monto\n2026-08-03,100')).rejects.toMatchObject({
        codigo: 'PERIODO_NO_ENCONTRADO',
      });
    });

    it('rechaza un CSV sin las columnas obligatorias', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await expect(importarGastosCsv(tenantId, periodo.id, 'nota\nsin fecha ni monto', HOY_DE_PRUEBA)).rejects.toMatchObject({
        codigo: 'VALIDACION',
      });
    });

    it('importa filas válidas dentro del periodo activo', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto,nota\n2026-08-03,150.50,Tacos\n2026-08-05,20,Café';

      const resultado = await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado).toEqual({ creados: 2, errores: [] });
      const { datos } = await listarGastos(tenantId, periodo.id);
      const montos = datos.map((g) => g.montoValorMinimo).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(montos).toEqual([2000n, 15050n]);
    });

    it('reporta por número de fila una fecha fuera del periodo activo, sin bloquear las demás', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto\n2026-08-03,100\n2026-09-01,200\n2026-08-05,50';

      const resultado = await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado.creados).toBe(2);
      expect(resultado.errores).toEqual([{ fila: 2, mensaje: expect.stringContaining('no cae dentro del periodo activo') }]);
    });

    it('reporta un monto inválido sin bloquear las demás filas', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto\n2026-08-03,abc\n2026-08-05,50';

      const resultado = await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado.creados).toBe(1);
      expect(resultado.errores).toEqual([{ fila: 1, mensaje: expect.stringContaining('positivo') }]);
    });

    it('reporta una fecha con formato inválido', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto\n03/08/2026,100';

      const resultado = await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado.creados).toBe(0);
      expect(resultado.errores).toEqual([{ fila: 1, mensaje: expect.stringContaining('YYYY-MM-DD') }]);
    });

    it('asigna la categoría por nombre, sin distinguir mayúsculas', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const categoria = await crearCategoriaPersonalizada(tenantId, 'Antojitos');
      const csv = 'fecha,monto,categoria\n2026-08-03,100,antojitos';

      await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos[0]?.categoriaId).toBe(categoria.id);
    });

    it('una categoría que no coincide con ninguna existente no es un error, solo queda sin categoría', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto,categoria\n2026-08-03,100,NoExiste';

      const resultado = await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado).toEqual({ creados: 1, errores: [] });
      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos[0]?.categoriaId).toBeNull();
    });

    it('respeta un campo de nota entrecomillado con una coma adentro', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto,nota\n2026-08-03,100,"Cena, con amigos"';

      await importarGastosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      const { datos } = await listarGastos(tenantId, periodo.id);
      expect(datos[0]?.nota).toBe('Cena, con amigos');
    });

    it('rechaza importar contra un periodo cerrado', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2026-08-01', fechaReferencia: HOY_DE_PRUEBA });
      await cerrarPeriodoManualmente(tenantId, periodo.id, HOY_DE_PRUEBA);

      await expect(importarGastosCsv(tenantId, periodo.id, 'fecha,monto\n2026-08-03,100', HOY_DE_PRUEBA)).rejects.toMatchObject({
        codigo: 'PERIODO_NO_ACTIVO',
      });
    });

    it('aislamiento entre tenants: no puede importar contra el periodo de otro tenant', async () => {
      const { tenantId: tenantA } = await tenantConPeriodoActivo();
      const { periodo: periodoB } = await tenantConPeriodoActivo();

      await expect(importarGastosCsv(tenantA, periodoB.id, 'fecha,monto\n2026-08-03,100', HOY_DE_PRUEBA)).rejects.toMatchObject({
        codigo: 'PERIODO_NO_ENCONTRADO',
      });
    });
  });

  describe('importarIngresosCsv', () => {
    it('importa filas válidas con el monto correcto', async () => {
      const { tenantId, periodo } = await tenantConPeriodoActivo();
      const csv = 'fecha,monto,nota\n2026-08-01,8000,Quincena';

      const resultado = await importarIngresosCsv(tenantId, periodo.id, csv, HOY_DE_PRUEBA);

      expect(resultado).toEqual({ creados: 1, errores: [] });
      const ingresos = await listarIngresos(tenantId, periodo.id);
      expect(ingresos[0]?.montoValorMinimo).toBe(800000n);
      expect(ingresos[0]?.nota).toBe('Quincena');
    });
  });
});
