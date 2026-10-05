import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listarCategorias } from '../../src/modulos/categorias/categorias.js';
import { cerrarPeriodoManualmente } from '../../src/modulos/cierre/cerrar-periodo.js';
import { obtenerResumen } from '../../src/modulos/cierre/generar-resumen.js';
import { obtenerDesglose } from '../../src/modulos/desglose/desglose.js';
import { editarGasto, eliminarGasto, registrarGasto } from '../../src/modulos/gastos/registrar-gasto.js';
import { resolverOcrearIdentidad } from '../../src/modulos/identidad/resolver-identidad.js';
import { registrarIngreso } from '../../src/modulos/ingresos/registrar-ingreso.js';
import { aportarAMeta, crearMeta, retirarDeMeta } from '../../src/modulos/metas/metas.js';
import { crearPeriodo } from '../../src/modulos/periodos/crear-periodo.js';
import { crearGastoRecurrente } from '../../src/modulos/recurrentes/recurrentes.js';
import { registrarCargoTarjeta } from '../../src/modulos/tarjetas/registrar-cargo.js';
import { crearTarjeta } from '../../src/modulos/tarjetas/tarjetas.js';

describe('desglose del periodo', () => {
  const HOY = new Date('2026-10-01T00:00:00Z'); // quincena 1-15 de octubre (7 / 8 días)
  // Último día del periodo: todos sus días ya pasaron, como en uno cerrado. El desglose recibe la
  // fecha explícita (no el reloj real) para que `diasTranscurridos` no dependa de cuándo corre la prueba.
  const FIN_PERIODO = new Date('2026-10-15T00:00:00Z');

  async function tenantConPeriodo() {
    const { tenantId } = await resolverOcrearIdentidad(`test-desglose-${randomUUID()}`);
    const periodo = await crearPeriodo(tenantId, 'quincenal', HOY);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2026-10-01', fechaReferencia: HOY });
    return { tenantId, periodo };
  }

  async function categoriaId(tenantId: string, nombre: string) {
    const categoria = (await listarCategorias(tenantId)).find((c) => c.nombre === nombre);
    if (!categoria) throw new Error(`no existe la categoría ${nombre}`);
    return categoria.id;
  }

  async function gastar(tenantId: string, periodoId: string, monto: bigint, fecha: string, categoria?: string) {
    return registrarGasto({ tenantId, periodoId, monto, moneda: 'MXN', fechaEfectiva: fecha, categoriaId: categoria, fechaReferencia: HOY });
  }

  it('rechaza un periodo que no existe o es de otro tenant (BOLA)', async () => {
    const { tenantId } = await tenantConPeriodo();
    const otro = await tenantConPeriodo();

    await expect(obtenerDesglose(tenantId, randomUUID())).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
    await expect(obtenerDesglose(tenantId, otro.periodo.id)).rejects.toMatchObject({ codigo: 'PERIODO_NO_ENCONTRADO' });
  });

  it('un periodo sin gastos da todo en cero y ninguna semana más cara', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();

    const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);

    expect(desglose.totalGastadoValorMinimo).toBe(0n);
    expect(desglose.rubros).toEqual([]);
    expect(desglose.semanas.map((s) => s.dias)).toEqual([7, 8]);
    expect(desglose.semanaMasCara).toBeNull();
  });

  it('desglosa por categoría y por bloque de 7 días, ordenado de mayor a menor', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    const comida = await categoriaId(tenantId, 'Comida');
    const transporte = await categoriaId(tenantId, 'Transporte');

    await gastar(tenantId, periodo.id, 10000n, '2026-10-02', comida);
    await gastar(tenantId, periodo.id, 5000n, '2026-10-09', comida);
    await gastar(tenantId, periodo.id, 3000n, '2026-10-09', transporte);
    await gastar(tenantId, periodo.id, 2000n, '2026-10-15');

    const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);

    expect(desglose.totalGastadoValorMinimo).toBe(20000n);
    expect(desglose.rubros.map((r) => [r.etiqueta, r.montoValorMinimo])).toEqual([
      ['Comida', 15000n],
      ['Transporte', 3000n],
      ['Sin categoría', 2000n],
    ]);
    // El 15 es parte de la semana 2 (días 8-15): ya no hay una "semana 3" de un solo día.
    expect(desglose.semanas.map((s) => s.totalValorMinimo)).toEqual([10000n, 10000n]);
    // Comida en la semana 2 = solo lo de esa semana, no el acumulado.
    const semana2 = desglose.semanas[1]!;
    expect(semana2.rubros.find((r) => r.clave === `categoria:${comida}`)?.montoValorMinimo).toBe(5000n);
  });

  it('la semana más cara se decide por promedio diario, no por total (la semana 2 tiene 8 días)', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    await gastar(tenantId, periodo.id, 7700n, '2026-10-02'); // 7700 / 7 días = 1100 al día
    await gastar(tenantId, periodo.id, 8000n, '2026-10-10'); // 8000 / 8 días = 1000 al día, pero total mayor

    const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);

    expect(desglose.semanas.map((s) => s.promedioDiarioValorMinimo)).toEqual([1100n, 1000n]);
    expect(desglose.semanaMasCara).toBe(1);
  });

  it('cuadra exacto con el totalGastado del resumen de cierre, incluyendo aportes a metas', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    const comida = await categoriaId(tenantId, 'Comida');
    await gastar(tenantId, periodo.id, 4000n, '2026-10-03', comida);
    const meta = await crearMeta(tenantId, 'Vacaciones', 100000n, 'MXN');
    await aportarAMeta({ tenantId, metaId: meta.id, monto: 1500n, moneda: 'MXN', fechaReferencia: HOY });

    const desgloseAntes = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
    await cerrarPeriodoManualmente(tenantId, periodo.id, new Date('2026-10-16T00:00:00Z'));
    const resumen = await obtenerResumen(tenantId, periodo.id);
    const desgloseDespues = await obtenerDesglose(tenantId, periodo.id, new Date('2026-10-16T00:00:00Z'));

    expect(resumen?.totalGastadoValorMinimo).toBe(5500n);
    expect(desgloseAntes.totalGastadoValorMinimo).toBe(5500n);
    expect(desgloseDespues.totalGastadoValorMinimo).toBe(resumen?.totalGastadoValorMinimo);
    expect(desgloseDespues.rubros.find((r) => r.tipo === 'aportes_meta')?.montoValorMinimo).toBe(1500n);
  });

  it('un gasto editado cuenta una sola vez, con el monto corregido y en la semana del original', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    const comida = await categoriaId(tenantId, 'Comida');
    const original = await gastar(tenantId, periodo.id, 5000n, '2026-10-02', comida);

    await editarGasto({ tenantId, gastoId: original.id, monto: 7000n, moneda: 'MXN', categoriaId: comida, fechaEfectiva: '2026-10-02', fechaReferencia: HOY });

    const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
    expect(desglose.totalGastadoValorMinimo).toBe(7000n);
    expect(desglose.rubros).toHaveLength(1);
    expect(desglose.rubros[0]?.montoValorMinimo).toBe(7000n);
    expect(desglose.semanas.map((s) => s.totalValorMinimo)).toEqual([7000n, 0n]);
  });

  it('un gasto eliminado desaparece por completo del desglose', async () => {
    const { tenantId, periodo } = await tenantConPeriodo();
    const gasto = await gastar(tenantId, periodo.id, 5000n, '2026-10-02');

    await eliminarGasto({ tenantId, gastoId: gasto.id, fechaReferencia: HOY });

    const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
    expect(desglose.totalGastadoValorMinimo).toBe(0n);
    expect(desglose.semanaMasCara).toBeNull();
  });

  it('una mensualidad de tarjeta se ubica por su fecha de vencimiento, no por el día 1 en que se materializa', async () => {
    const { tenantId } = await resolverOcrearIdentidad(`test-desglose-${randomUUID()}`).then((i) => ({ tenantId: i.tenantId }));
    // Corte día 5 + 10 días para pagar; compra del 3 de agosto -> vence el 15 de agosto.
    const tarjeta = await crearTarjeta(tenantId, 'BBVA', 1000000n, 'MXN', 5, 10);
    await registrarCargoTarjeta({
      tenantId,
      tarjetaId: tarjeta.id,
      descripcion: 'Laptop',
      montoTotalValorMinimo: 30000n,
      moneda: 'MXN',
      numeroPlazos: 1,
      fechaCompra: '2026-08-03',
    });
    const periodo = await crearPeriodo(tenantId, 'quincenal', new Date('2026-08-05T00:00:00Z'));

    const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-08-15T00:00:00Z'));

    expect(desglose.rubros).toEqual([{ clave: 'pagos_tarjeta', etiqueta: 'Pagos de tarjeta', tipo: 'pagos_tarjeta', montoValorMinimo: 30000n }]);
    // 15 de agosto = último día del periodo (semana 2); sin la fecha de vencimiento caería el día 1, en la semana 1.
    expect(desglose.semanas.map((s) => s.totalValorMinimo)).toEqual([0n, 30000n]);
  });

  it('los recurrentes van aparte: no entran a categorías ni a semanas, pero sí al total', async () => {
    const { tenantId } = await resolverOcrearIdentidad(`test-desglose-${randomUUID()}`).then((i) => ({ tenantId: i.tenantId }));
    const hoy = new Date('2026-08-16T00:00:00Z'); // quincena 16-31 de agosto (7 / 9 días)
    const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
    await registrarIngreso({ tenantId, periodoId: periodo.id, monto: 100000n, moneda: 'MXN', fechaEfectiva: '2026-08-16', fechaReferencia: hoy });
    await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 21900n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 25, fechaReferencia: hoy });
    await registrarGasto({ tenantId, periodoId: periodo.id, monto: 1500n, moneda: 'MXN', fechaEfectiva: '2026-08-18', fechaReferencia: hoy });

    const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-08-31T00:00:00Z'));

    expect(desglose.totalGastadoValorMinimo).toBe(23400n);
    expect(desglose.recurrentes.totalValorMinimo).toBe(21900n);
    expect(desglose.recurrentes.items).toEqual([expect.objectContaining({ descripcion: 'Renta', frecuencia: 'mensual', diaMes: 25, montoValorMinimo: 21900n })]);
    expect(desglose.totalVariableValorMinimo).toBe(1500n);
    // Rubros y semanas cubren solo lo variable: la renta no infla ninguna semana ni categoría.
    expect(desglose.rubros.map((r) => r.montoValorMinimo)).toEqual([1500n]);
    expect(desglose.semanas.map((s) => s.totalValorMinimo)).toEqual([1500n, 0n]);
    expect(desglose.semanas.map((s) => s.dias)).toEqual([7, 9]);
  });

  it('un periodo con solo recurrentes no tiene semana más cara', async () => {
    const { tenantId } = await resolverOcrearIdentidad(`test-desglose-${randomUUID()}`).then((i) => ({ tenantId: i.tenantId }));
    const hoy = new Date('2026-08-16T00:00:00Z');
    const periodo = await crearPeriodo(tenantId, 'quincenal', hoy);
    await crearGastoRecurrente({ tenantId, descripcion: 'Renta', montoValorMinimo: 21900n, moneda: 'MXN', frecuencia: 'mensual', diaMes: 25, fechaReferencia: hoy });

    const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-08-31T00:00:00Z'));

    expect(desglose.totalVariableValorMinimo).toBe(0n);
    expect(desglose.semanaMasCara).toBeNull();
  });
  describe('aportes a metas que vuelven a la quincena (retiro)', () => {
    async function conAporteYRetiro(aporte: bigint, retiro: bigint, fechaRetiro = HOY) {
      const { tenantId, periodo } = await tenantConPeriodo();
      const meta = await crearMeta(tenantId, 'Viaje', 1000000n, 'MXN');
      await aportarAMeta({ tenantId, metaId: meta.id, monto: aporte, moneda: 'MXN', fechaReferencia: HOY });
      await retirarDeMeta({ tenantId, metaId: meta.id, monto: retiro, moneda: 'MXN', motivo: 'Se necesitó', fechaReferencia: fechaRetiro });
      return { tenantId, periodo };
    }

    it('lo aportado y retirado completo no cuenta como gasto ni como ingreso', async () => {
      const { tenantId, periodo } = await conAporteYRetiro(50000n, 50000n);

      const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
      expect(desglose.totalGastadoValorMinimo).toBe(0n);
      expect(desglose.rubros).toEqual([]);
      expect(desglose.semanas.every((semana) => semana.totalValorMinimo === 0n && semana.rubros.length === 0)).toBe(true);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, FIN_PERIODO);
      expect(resumen.totalIngresosValorMinimo).toBe(100000n); // solo el ingreso real
      expect(resumen.totalGastadoValorMinimo).toBe(0n);
      expect(resumen.sobranteValorMinimo).toBe(100000n);
    });

    it('un retiro menor al aporte deja como gasto solo la diferencia, y el desglose cuadra con el resumen', async () => {
      const { tenantId, periodo } = await conAporteYRetiro(50000n, 20000n);

      const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
      expect(desglose.totalGastadoValorMinimo).toBe(30000n);
      expect(desglose.rubros.map((r) => [r.tipo, r.montoValorMinimo])).toEqual([['aportes_meta', 30000n]]);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, FIN_PERIODO);
      expect(resumen.totalGastadoValorMinimo).toBe(desglose.totalGastadoValorMinimo);
      expect(resumen.totalIngresosValorMinimo).toBe(100000n);
      expect(resumen.sobranteValorMinimo).toBe(70000n);
    });

    it('un retiro mayor al aporte conserva el excedente como ingreso (dinero de ahorros anteriores)', async () => {
      const { tenantId, periodo } = await conAporteYRetiro(20000n, 50000n);

      const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
      expect(desglose.totalGastadoValorMinimo).toBe(0n);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, FIN_PERIODO);
      expect(resumen.totalIngresosValorMinimo).toBe(130000n); // 100000 + (50000 - 20000)
      expect(resumen.totalGastadoValorMinimo).toBe(0n);
      expect(resumen.sobranteValorMinimo).toBe(130000n);
    });

    it('los gastos normales no se tocan: solo se compensa lo que fue a una meta y volvió', async () => {
      const { tenantId, periodo } = await conAporteYRetiro(50000n, 50000n);
      await gastar(tenantId, periodo.id, 40000n, '2026-10-02');

      const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);
      expect(desglose.totalGastadoValorMinimo).toBe(40000n);

      const resumen = await cerrarPeriodoManualmente(tenantId, periodo.id, FIN_PERIODO);
      expect(resumen.totalGastadoValorMinimo).toBe(40000n);
      expect(resumen.sobranteValorMinimo).toBe(60000n);
    });

    it('el aporte de una semana se compensa con un retiro de otra, sin dejar semanas en negativo', async () => {
      const { tenantId, periodo } = await conAporteYRetiro(50000n, 50000n, new Date('2026-10-10T00:00:00Z'));

      const desglose = await obtenerDesglose(tenantId, periodo.id, FIN_PERIODO);

      expect(desglose.totalGastadoValorMinimo).toBe(0n);
      expect(desglose.semanas.every((semana) => semana.totalValorMinimo >= 0n)).toBe(true);
    });
  });

  describe('periodo activo: el promedio usa solo los días transcurridos', () => {
    it('la semana en curso se promedia entre los días que ya pasaron, no entre todos los de su bloque', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await gastar(tenantId, periodo.id, 7000n, '2026-10-02'); // semana 1, 7 días: 1000 al día
      await gastar(tenantId, periodo.id, 4800n, '2026-10-10'); // semana 2, van 4 de 8 días (8 al 11): 1200 al día

      const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-10-11T00:00:00Z'));

      expect(desglose.semanas.map((s) => [s.dias, s.diasTranscurridos])).toEqual([
        [7, 7],
        [8, 4],
      ]);
      // Entre los 8 días completos serían 600 al día y la semana 1 ganaría; con los 4 reales gana la 2.
      expect(desglose.semanas.map((s) => s.promedioDiarioValorMinimo)).toEqual([1000n, 1200n]);
      expect(desglose.semanaMasCara).toBe(2);
    });

    it('la primera semana sola no basta para declarar una más cara', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await gastar(tenantId, periodo.id, 5000n, '2026-10-02');

      const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-10-03T00:00:00Z'));

      expect(desglose.semanas.map((s) => s.diasTranscurridos)).toEqual([3, 0]);
      expect(desglose.semanas.map((s) => s.promedioDiarioValorMinimo)).toEqual([1666n, 0n]);
      expect(desglose.semanaMasCara).toBeNull();
    });

    it('una semana con menos de 3 días transcurridos no se compara todavía (un gasto grande el día 8 no la corona)', async () => {
      const { tenantId, periodo } = await tenantConPeriodo();
      await gastar(tenantId, periodo.id, 7000n, '2026-10-02');
      await gastar(tenantId, periodo.id, 9000n, '2026-10-08');

      const desglose = await obtenerDesglose(tenantId, periodo.id, new Date('2026-10-09T00:00:00Z'));

      expect(desglose.semanas[1]?.diasTranscurridos).toBe(2);
      expect(desglose.semanaMasCara).toBeNull();
    });
  });
});
