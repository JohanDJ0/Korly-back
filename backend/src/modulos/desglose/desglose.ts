import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { pagosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { categorias } from '../../db/schema/categorias.js';
import { gastos } from '../../db/schema/gastos.js';
import { gastosRecurrentes } from '../../db/schema/gastos-recurrentes.js';
import { asientos, movimientos, type TipoMovimiento } from '../../db/schema/ledger.js';
import { TIPOS_GASTO } from '../cierre/generar-resumen.js';
import { obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { ahoraEnMexico, fechaISO } from '../../shared/fechas.js';
import { acotarFecha, calcularBloquesSemana, diasTranscurridosDelBloque, indiceBloque } from './semanas.js';

const movimientoRevertido = alias(movimientos, 'movimiento_revertido');

export type TipoRubro = 'categoria' | 'sin_categoria' | 'aportes_meta' | 'pagos_tarjeta';

export interface RubroDesglose {
  clave: string;
  etiqueta: string;
  tipo: TipoRubro;
  montoValorMinimo: bigint;
}

export interface SemanaDesglose {
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  /** Días del bloque que ya pasaron — igual a `dias` salvo en el periodo activo (el bloque en curso y los que faltan). */
  diasTranscurridos: number;
  totalValorMinimo: bigint;
  /** Entre `diasTranscurridos`, no `dias`; truncado hacia abajo, igual que la cifra diaria (ADR-002). */
  promedioDiarioValorMinimo: bigint;
  rubros: { clave: string; montoValorMinimo: bigint }[];
}

export interface RecurrenteDesglose {
  id: string;
  descripcion: string;
  frecuencia: string;
  diaMes: number | null;
  montoValorMinimo: bigint;
}

export interface Desglose {
  periodoId: string;
  fechaInicio: string;
  fechaFin: string;
  moneda: string;
  /** Igual a `totalGastado` del resumen de cierre, por construcción — ver `obtenerDesglose`. */
  totalGastadoValorMinimo: bigint;
  /** `totalGastado` menos los recurrentes: es lo que cubren `rubros` y `semanas`. */
  totalVariableValorMinimo: bigint;
  /** Compromisos fijos del periodo, aparte del análisis por rubro/semana — ver `obtenerDesglose`. */
  recurrentes: { totalValorMinimo: bigint; items: RecurrenteDesglose[] };
  rubros: RubroDesglose[];
  semanas: SemanaDesglose[];
  /**
   * Número de la semana con mayor promedio diario (no mayor total: los
   * bloques no miden lo mismo). `null` si no hay al menos dos semanas con
   * `MIN_DIAS_PARA_COMPARAR` días transcurridos — comparar el promedio de
   * uno o dos días contra el de una semana completa es ruido, no señal.
   */
  semanaMasCara: number | null;
}

const MIN_DIAS_PARA_COMPARAR = 3;
const ETIQUETA_SIN_CATEGORIA = 'Sin categoría';
const ETIQUETA_APORTES = 'Aportes a metas';
const ETIQUETA_PAGOS_TARJETA = 'Pagos de tarjeta';

/**
 * Desglose de lo gastado en un periodo por rubro y por bloque de 7 días
 * (propuesta aprobada con el usuario — ver backend/README.md, "Desglose
 * del periodo"). Se calcula al consultar, sin guardar nada: la categoría
 * vive en `gastos` y la fecha en `movimientos`, ambos inmutables, así que
 * funciona igual para periodos cerrados que para el activo.
 *
 * **Cuadra con el resumen por construcción, no por casualidad:** recorre
 * exactamente los mismos asientos de la cuenta del periodo que
 * `calcularTotalesTx` (generar-resumen.ts) — mismo filtro por tipo
 * efectivo (una reversión cuenta como lo que revierte) y mismo
 * `TIPOS_GASTO` — así que la suma de los rubros es igual a `totalGastado`.
 * Una reversión cae en la misma semana y rubro que lo que revierte
 * cuando el original está en este periodo (se cancelan y el gasto
 * corregido es lo único que cuenta); si el original es de un periodo ya
 * cerrado, la reversión entra aquí como crédito en su propia fecha — el
 * periodo cerrado conserva el original, tal como lo congeló su resumen.
 *
 * **Los recurrentes van aparte** (pedido del usuario: fechados al inicio
 * del periodo inflaban siempre la semana 1, y de todos modos no son algo
 * que decidió gastar esa semana): no entran a `rubros` ni a `semanas`,
 * se listan en `recurrentes` y `totalVariable` es el resto. Un recurrente
 * que el usuario edita para un periodo se reemplaza por un gasto nuevo
 * sin `origenRecurrenteId` (editarGasto), y ese sí cuenta como variable.
 *
 * **Fecha de las mensualidades de tarjeta:** se materializan fechadas al
 * inicio del periodo; aquí se ubican por su vencimiento real.
 */
export async function obtenerDesglose(tenantId: string, periodoId: string, fechaReferencia: Date = ahoraEnMexico()): Promise<Desglose> {
  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia);
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }

    const filas = await tx
      .select({
        monto: asientos.montoValorMinimo,
        movimientoId: movimientos.id,
        tipo: movimientos.tipo,
        fechaEfectiva: movimientos.fechaEfectiva,
        moneda: movimientos.moneda,
        origenId: movimientoRevertido.id,
        origenTipo: movimientoRevertido.tipo,
        origenFecha: movimientoRevertido.fechaEfectiva,
      })
      .from(asientos)
      .innerJoin(movimientos, eq(movimientos.id, asientos.movimientoId))
      .leftJoin(movimientoRevertido, eq(movimientoRevertido.id, movimientos.movimientoRevertidoId))
      .where(and(eq(asientos.tenantId, tenantId), eq(asientos.cuentaId, periodo.cuentaId)));

    const tipoEfectivoDe = (fila: (typeof filas)[number]): TipoMovimiento => (fila.origenTipo ?? fila.tipo) as TipoMovimiento;
    const filasDeGasto = filas.filter((fila) => TIPOS_GASTO.has(tipoEfectivoDe(fila)));
    const idEfectivoDe = (fila: (typeof filas)[number]) => fila.origenId ?? fila.movimientoId;

    const idsDeGasto = filasDeGasto.filter((fila) => tipoEfectivoDe(fila) === 'gasto').map(idEfectivoDe);
    const idsDePago = filasDeGasto.filter((fila) => tipoEfectivoDe(fila) === 'pago_tarjeta').map(idEfectivoDe);

    const gastosPorMovimiento = new Map<string, { categoriaId: string | null; origenRecurrenteId: string | null }>();
    if (idsDeGasto.length > 0) {
      const filasGastos = await tx
        .select({ movimientoId: gastos.movimientoId, categoriaId: gastos.categoriaId, origenRecurrenteId: gastos.origenRecurrenteId })
        .from(gastos)
        .where(and(eq(gastos.tenantId, tenantId), inArray(gastos.movimientoId, idsDeGasto)));
      for (const g of filasGastos) gastosPorMovimiento.set(g.movimientoId, g);
    }

    const idsRecurrentes = [...new Set([...gastosPorMovimiento.values()].map((g) => g.origenRecurrenteId).filter((id): id is string => id !== null))];
    const recurrentesPorId = new Map<string, { descripcion: string; frecuencia: string; diaMes: number | null }>();
    if (idsRecurrentes.length > 0) {
      const filasRecurrentes = await tx
        .select({ id: gastosRecurrentes.id, descripcion: gastosRecurrentes.descripcion, frecuencia: gastosRecurrentes.frecuencia, diaMes: gastosRecurrentes.diaMes })
        .from(gastosRecurrentes)
        .where(and(eq(gastosRecurrentes.tenantId, tenantId), inArray(gastosRecurrentes.id, idsRecurrentes)));
      for (const r of filasRecurrentes) recurrentesPorId.set(r.id, r);
    }

    const vencimientoPorMovimiento = new Map<string, string>();
    if (idsDePago.length > 0) {
      const filasPagos = await tx
        .select({ movimientoId: pagosTarjeta.movimientoId, fechaVencimiento: pagosTarjeta.fechaVencimiento })
        .from(pagosTarjeta)
        .where(and(eq(pagosTarjeta.tenantId, tenantId), inArray(pagosTarjeta.movimientoId, idsDePago)));
      for (const p of filasPagos) {
        if (p.movimientoId) vencimientoPorMovimiento.set(p.movimientoId, p.fechaVencimiento);
      }
    }

    const idsDeOriginalesEnEstaCuenta = new Set(filas.filter((fila) => fila.origenId === null).map((fila) => fila.movimientoId));

    function fechaRealDelOriginal(idOriginal: string, tipoEfectivo: TipoMovimiento, fechaOriginal: string): string {
      return tipoEfectivo === 'pago_tarjeta' ? (vencimientoPorMovimiento.get(idOriginal) ?? fechaOriginal) : fechaOriginal;
    }

    const bloques = calcularBloquesSemana(periodo.fechaInicio, periodo.fechaFin);
    const totalesPorSemana = bloques.map(() => ({ total: 0n, porRubro: new Map<string, bigint>() }));
    const rubros = new Map<string, { etiqueta: string; tipo: TipoRubro; monto: bigint; categoriaId: string | null }>();
    const montoPorRecurrente = new Map<string, bigint>();
    let totalGastadoValorMinimo = 0n;
    let totalRecurrentesValorMinimo = 0n;
    const monedas = new Set<string>();

    for (const fila of filasDeGasto) {
      const tipoEfectivo = tipoEfectivoDe(fila);
      const idEfectivo = idEfectivoDe(fila);
      const importe = -fila.monto;
      monedas.add(fila.moneda);
      totalGastadoValorMinimo += importe;

      const origenRecurrenteId = tipoEfectivo === 'gasto' ? (gastosPorMovimiento.get(idEfectivo)?.origenRecurrenteId ?? null) : null;
      if (origenRecurrenteId) {
        montoPorRecurrente.set(origenRecurrenteId, (montoPorRecurrente.get(origenRecurrenteId) ?? 0n) + importe);
        totalRecurrentesValorMinimo += importe;
        continue;
      }

      let clave: string;
      let etiqueta: string;
      let tipoRubro: TipoRubro;
      let categoriaId: string | null = null;
      if (tipoEfectivo === 'aporte_meta') {
        clave = 'aportes_meta';
        etiqueta = ETIQUETA_APORTES;
        tipoRubro = 'aportes_meta';
      } else if (tipoEfectivo === 'pago_tarjeta') {
        clave = 'pagos_tarjeta';
        etiqueta = ETIQUETA_PAGOS_TARJETA;
        tipoRubro = 'pagos_tarjeta';
      } else {
        categoriaId = gastosPorMovimiento.get(idEfectivo)?.categoriaId ?? null;
        clave = categoriaId ? `categoria:${categoriaId}` : 'sin_categoria';
        etiqueta = ETIQUETA_SIN_CATEGORIA;
        tipoRubro = categoriaId ? 'categoria' : 'sin_categoria';
      }

      const fechaBase =
        fila.origenId === null
          ? fechaRealDelOriginal(idEfectivo, tipoEfectivo, fila.fechaEfectiva)
          : idsDeOriginalesEnEstaCuenta.has(fila.origenId)
            ? fechaRealDelOriginal(fila.origenId, tipoEfectivo, fila.origenFecha ?? fila.fechaEfectiva)
            : fila.fechaEfectiva;
      const fecha = acotarFecha(fechaBase, periodo.fechaInicio, periodo.fechaFin);

      const semana = totalesPorSemana[indiceBloque(periodo.fechaInicio, fecha, bloques.length)];
      if (!semana) throw new Error('Fecha fuera de los bloques del periodo');
      semana.total += importe;
      semana.porRubro.set(clave, (semana.porRubro.get(clave) ?? 0n) + importe);

      const rubro = rubros.get(clave) ?? { etiqueta, tipo: tipoRubro, monto: 0n, categoriaId };
      rubro.monto += importe;
      rubros.set(clave, rubro);
    }

    if (monedas.size > 1) {
      throw new Error(`La cuenta ${periodo.cuentaId} mezcla más de una moneda entre sus movimientos (fuera de alcance del MVP)`);
    }

    const idsDeCategoria = [...rubros.values()].map((r) => r.categoriaId).filter((id): id is string => id !== null);
    if (idsDeCategoria.length > 0) {
      const filasCategorias = await tx
        .select({ id: categorias.id, nombre: categorias.nombre })
        .from(categorias)
        .where(and(eq(categorias.tenantId, tenantId), inArray(categorias.id, idsDeCategoria)));
      const nombres = new Map(filasCategorias.map((c) => [c.id, c.nombre]));
      for (const rubro of rubros.values()) {
        if (rubro.categoriaId) rubro.etiqueta = nombres.get(rubro.categoriaId) ?? ETIQUETA_SIN_CATEGORIA;
      }
    }

    // En un periodo cerrado todos los días ya pasaron; en el activo, el
    // bloque en curso solo ha vivido parte de sus días (dividir entre
    // todos lo haría ver artificialmente barato a mitad de semana).
    const hoy = fechaISO(fechaReferencia);
    const semanas: SemanaDesglose[] = bloques.map((bloque, indice) => {
      const acumulado = totalesPorSemana[indice]!;
      const diasTranscurridos = diasTranscurridosDelBloque(bloque, hoy);
      return {
        ...bloque,
        diasTranscurridos,
        totalValorMinimo: acumulado.total,
        promedioDiarioValorMinimo: diasTranscurridos > 0 ? acumulado.total / BigInt(diasTranscurridos) : 0n,
        rubros: [...acumulado.porRubro.entries()].map(([clave, montoValorMinimo]) => ({ clave, montoValorMinimo })),
      };
    });

    const comparables = semanas.filter((semana) => semana.diasTranscurridos >= MIN_DIAS_PARA_COMPARAR);
    let semanaMasCara: number | null = null;
    let mayorPromedio = 0n;
    if (comparables.length >= 2) {
      for (const semana of comparables) {
        if (semana.promedioDiarioValorMinimo > mayorPromedio) {
          mayorPromedio = semana.promedioDiarioValorMinimo;
          semanaMasCara = semana.numero;
        }
      }
    }

    const itemsRecurrentes: RecurrenteDesglose[] = [...montoPorRecurrente.entries()]
      .filter(([, monto]) => monto !== 0n)
      .map(([id, montoValorMinimo]) => {
        const plantilla = recurrentesPorId.get(id);
        return { id, descripcion: plantilla?.descripcion ?? 'Recurrente', frecuencia: plantilla?.frecuencia ?? 'mensual', diaMes: plantilla?.diaMes ?? null, montoValorMinimo };
      })
      .sort((a, b) => (a.montoValorMinimo < b.montoValorMinimo ? 1 : a.montoValorMinimo > b.montoValorMinimo ? -1 : 0));

    return {
      periodoId: periodo.id,
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      moneda: monedas.values().next().value ?? 'MXN',
      totalGastadoValorMinimo,
      totalVariableValorMinimo: totalGastadoValorMinimo - totalRecurrentesValorMinimo,
      recurrentes: { totalValorMinimo: totalRecurrentesValorMinimo, items: itemsRecurrentes },
      rubros: [...rubros.entries()]
        .map(([clave, rubro]) => ({ clave, etiqueta: rubro.etiqueta, tipo: rubro.tipo, montoValorMinimo: rubro.monto }))
        .sort((a, b) => (a.montoValorMinimo < b.montoValorMinimo ? 1 : a.montoValorMinimo > b.montoValorMinimo ? -1 : 0)),
      semanas,
      semanaMasCara,
    };
  });
}
