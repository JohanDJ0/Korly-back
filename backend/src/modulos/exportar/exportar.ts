import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { categorias } from '../../db/schema/categorias.js';
import { gastos } from '../../db/schema/gastos.js';
import { ingresos } from '../../db/schema/ingresos.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { periodos } from '../../db/schema/periodos.js';
import { conTenant } from '../../shared/db.js';
import { centavosADecimalCsv, filaCsv } from '../../shared/csv.js';

export interface FiltroExportacion {
  /** 'YYYY-MM-DD' inclusive, sobre `fechaEfectiva` (cuándo ocurrió, no cuándo se registró). */
  desde?: string;
  hasta?: string;
}

/**
 * A diferencia de `listarGastos`/`listarIngresos` (por periodo, con
 * paginación en el caso de gastos), esto es todo el historial del
 * tenant de una vez — documento-maestro-v2.md §12, "importación/
 * exportación" (respaldo, compartir con un contador, portabilidad).
 * Sin paginación: un CSV completo es justamente el punto, no una
 * página a la vez.
 */
export async function exportarGastosCsv(tenantId: string, filtro: FiltroExportacion = {}): Promise<string> {
  return conTenant(tenantId, async (tx) => {
    const condiciones = [eq(gastos.tenantId, tenantId)];
    if (filtro.desde) condiciones.push(gte(movimientos.fechaEfectiva, filtro.desde));
    if (filtro.hasta) condiciones.push(lte(movimientos.fechaEfectiva, filtro.hasta));

    const filas = await tx
      .select({
        movimientoId: gastos.movimientoId,
        fechaEfectiva: movimientos.fechaEfectiva,
        montoValorMinimo: asientos.montoValorMinimo,
        moneda: movimientos.moneda,
        nota: movimientos.nota,
        categoriaNombre: categorias.nombre,
        periodoFechaInicio: periodos.fechaInicio,
        periodoFechaFin: periodos.fechaFin,
      })
      .from(gastos)
      .innerJoin(movimientos, eq(movimientos.id, gastos.movimientoId))
      .innerJoin(asientos, and(eq(asientos.movimientoId, gastos.movimientoId), isNotNull(asientos.cuentaId)))
      .innerJoin(periodos, eq(periodos.id, gastos.periodoId))
      .leftJoin(categorias, eq(categorias.id, gastos.categoriaId))
      .where(and(...condiciones))
      .orderBy(asc(movimientos.fechaEfectiva));

    // Mismo criterio que listarGastos: segunda consulta, no un JOIN
    // (movimientos.movimientoRevertidoId apunta a otra fila de la misma
    // tabla — un JOIN directo duplicaría filas si algún día un
    // movimiento admite más de una reversión).
    const movimientoIds = filas.map((fila) => fila.movimientoId);
    const revertidos =
      movimientoIds.length === 0
        ? []
        : await tx
            .select({ movimientoRevertidoId: movimientos.movimientoRevertidoId })
            .from(movimientos)
            .where(and(eq(movimientos.tenantId, tenantId), inArray(movimientos.movimientoRevertidoId, movimientoIds)));
    const idsRevertidos = new Set(revertidos.map((fila) => fila.movimientoRevertidoId));

    let csv = filaCsv(['fecha', 'monto', 'moneda', 'categoria', 'nota', 'revertido', 'periodo_inicio', 'periodo_fin']);
    for (const fila of filas) {
      csv += filaCsv([
        fila.fechaEfectiva,
        // El asiento con cuentaId no nulo de un gasto siempre es
        // negativo (ver comentario de cuentaId en db/schema/ledger.ts)
        // — se invierte para mostrar el monto como positivo, mismo
        // criterio que listarGastos.
        centavosADecimalCsv(-fila.montoValorMinimo),
        fila.moneda,
        fila.categoriaNombre ?? '',
        fila.nota ?? '',
        idsRevertidos.has(fila.movimientoId) ? 'true' : 'false',
        fila.periodoFechaInicio,
        fila.periodoFechaFin,
      ]);
    }
    return csv;
  });
}

export async function exportarIngresosCsv(tenantId: string, filtro: FiltroExportacion = {}): Promise<string> {
  return conTenant(tenantId, async (tx) => {
    const condiciones = [eq(ingresos.tenantId, tenantId)];
    if (filtro.desde) condiciones.push(gte(movimientos.fechaEfectiva, filtro.desde));
    if (filtro.hasta) condiciones.push(lte(movimientos.fechaEfectiva, filtro.hasta));

    const filas = await tx
      .select({
        movimientoId: ingresos.movimientoId,
        fechaEfectiva: movimientos.fechaEfectiva,
        montoValorMinimo: asientos.montoValorMinimo,
        moneda: movimientos.moneda,
        nota: movimientos.nota,
        periodoFechaInicio: periodos.fechaInicio,
        periodoFechaFin: periodos.fechaFin,
      })
      .from(ingresos)
      .innerJoin(movimientos, eq(movimientos.id, ingresos.movimientoId))
      .innerJoin(asientos, and(eq(asientos.movimientoId, ingresos.movimientoId), isNotNull(asientos.cuentaId)))
      .innerJoin(periodos, eq(periodos.id, ingresos.periodoId))
      .where(and(...condiciones))
      .orderBy(asc(movimientos.fechaEfectiva));

    const movimientoIds = filas.map((fila) => fila.movimientoId);
    const revertidos =
      movimientoIds.length === 0
        ? []
        : await tx
            .select({ movimientoRevertidoId: movimientos.movimientoRevertidoId })
            .from(movimientos)
            .where(and(eq(movimientos.tenantId, tenantId), inArray(movimientos.movimientoRevertidoId, movimientoIds)));
    const idsRevertidos = new Set(revertidos.map((fila) => fila.movimientoRevertidoId));

    let csv = filaCsv(['fecha', 'monto', 'moneda', 'nota', 'revertido', 'periodo_inicio', 'periodo_fin']);
    for (const fila of filas) {
      csv += filaCsv([
        fila.fechaEfectiva,
        // Para un ingreso el asiento con cuentaId ya es positivo por
        // construcción de registrarIngreso — sin invertir, a diferencia de gastos.
        centavosADecimalCsv(fila.montoValorMinimo),
        fila.moneda,
        fila.nota ?? '',
        idsRevertidos.has(fila.movimientoId) ? 'true' : 'false',
        fila.periodoFechaInicio,
        fila.periodoFechaFin,
      ]);
    }
    return csv;
  });
}
