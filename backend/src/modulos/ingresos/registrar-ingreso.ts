import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { ingresos } from '../../db/schema/ingresos.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { registrarMovimientoTx, revertirMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivoTx, obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { fechaISO } from '../../shared/fechas.js';

export interface RegistrarIngresoEntrada {
  tenantId: string;
  periodoId: string;
  /** Siempre positivo — un ingreso nunca resta (ver validación abajo). */
  monto: bigint;
  moneda: string;
  /** 'YYYY-MM-DD' — cuándo llegó realmente el dinero (ADR-007), no cuándo se registra. */
  fechaEfectiva: string;
  nota?: string;
  /**
   * Para el cierre perezoso que resuelve el periodo destino (ADR-004:
   * "fecha objetivo pasada como parámetro, nunca now() dentro del job").
   * Por defecto `new Date()` — el caso real. Exponerlo (en vez de dejarlo
   * fijo dentro de la función, como estaba antes) es lo que le permite a
   * un test fijar "hoy" y no depender de la fecha real de cuando corra.
   */
  fechaReferencia?: Date;
}

export interface IngresoRegistrado {
  id: string;
  movimientoId: string;
}

/**
 * Registra un ingreso contra un periodo, en una sola transacción:
 * validar el periodo + generar el asiento de ledger + dejar el vínculo
 * ingreso→periodo, todo o nada.
 *
 * El periodo destino debe estar Activo (openapi.yaml, invariante 10 de
 * modelo-dominio.md): un periodo en Borrador o Cerrado no acepta
 * movimientos nuevos.
 */
export async function registrarIngreso(entrada: RegistrarIngresoEntrada): Promise<IngresoRegistrado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un ingreso debe ser positivo');
  }

  return conTenant(entrada.tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, entrada.tenantId, entrada.periodoId, entrada.fechaReferencia ?? new Date());
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }
    if (periodo.estado !== 'activo') {
      throw new ErrorDominio('PERIODO_NO_ACTIVO', 'El periodo especificado no está en estado Activo');
    }

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'ingreso',
      moneda: entrada.moneda,
      fechaEfectiva: entrada.fechaEfectiva,
      nota: entrada.nota,
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: entrada.monto },
        { cuentaId: null, montoValorMinimo: -entrada.monto },
      ],
    });

    const [ingreso] = await tx
      .insert(ingresos)
      .values({ tenantId: entrada.tenantId, periodoId: entrada.periodoId, movimientoId })
      .returning({ id: ingresos.id });
    if (!ingreso) throw new Error('No se pudo registrar el ingreso');

    return { id: ingreso.id, movimientoId };
  });
}

/**
 * Usado por el motor de flujo de caja (modelo-dominio.md §5) para
 * decidir el estado `sin_ingreso`: un periodo sin ningún ingreso
 * registrado no muestra una cifra de disponible como si fuera cierta,
 * aunque ya tenga gastos. No importa el monto acumulado, solo si existe
 * al menos una fila — de ahí que no haga falta traer más que el id.
 */
export async function existeIngresoParaPeriodo(tenantId: string, periodoId: string): Promise<boolean> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ id: ingresos.id })
      .from(ingresos)
      .where(and(eq(ingresos.tenantId, tenantId), eq(ingresos.periodoId, periodoId)))
      .limit(1);

    return fila !== undefined;
  });
}

/**
 * Carga lo necesario para corregir un ingreso y valida que sea
 * corregible — mismo criterio que `cargarGastoParaCorreccionTx` en
 * modulos/gastos/registrar-gasto.ts (que existe y no se comparte entre
 * módulos porque cada uno lee su propia tabla de vínculo).
 */
async function cargarIngresoParaCorreccionTx(
  tx: Ejecutor,
  tenantId: string,
  ingresoId: string
): Promise<{ movimientoId: string; periodoId: string }> {
  const [ingreso] = await tx
    .select({ movimientoId: ingresos.movimientoId, periodoId: ingresos.periodoId })
    .from(ingresos)
    .where(and(eq(ingresos.tenantId, tenantId), eq(ingresos.id, ingresoId)))
    .limit(1);
  if (!ingreso) {
    throw new ErrorDominio('INGRESO_NO_ENCONTRADO', 'El ingreso especificado no existe');
  }

  const [reversionExistente] = await tx
    .select({ id: movimientos.id })
    .from(movimientos)
    .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.movimientoRevertidoId, ingreso.movimientoId)))
    .limit(1);
  if (reversionExistente) {
    throw new ErrorDominio('INGRESO_YA_REVERTIDO', 'Este ingreso ya fue editado o eliminado antes');
  }

  return ingreso;
}

/** Mismo criterio que `periodoActivoObligatorioTx` en registrar-gasto.ts. */
async function periodoActivoObligatorioTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date) {
  const periodoActivo = await obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia);
  if (!periodoActivo) {
    throw new ErrorDominio('SIN_PERIODO_ACTIVO', 'No hay periodo activo para aplicar el ajuste');
  }
  return periodoActivo;
}

export interface EliminarIngresoEntrada {
  tenantId: string;
  ingresoId: string;
  fechaReferencia?: Date;
}

/**
 * "Elimina" un ingreso sin tocar su fila jamás (`ingresos_inmutables`,
 * migración 0005, lo impide de cualquier forma) — mismo mecanismo que
 * `eliminarGasto`: genera la reversión de su movimiento contra el
 * periodo activo actual.
 */
export async function eliminarIngreso(entrada: EliminarIngresoEntrada): Promise<void> {
  const fechaReferencia = entrada.fechaReferencia ?? new Date();

  await conTenant(entrada.tenantId, async (tx) => {
    const ingresoOriginal = await cargarIngresoParaCorreccionTx(tx, entrada.tenantId, entrada.ingresoId);
    const periodoActivo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia);

    await revertirMovimientoTx(
      tx,
      entrada.tenantId,
      ingresoOriginal.movimientoId,
      periodoActivo.cuentaId,
      fechaISO(fechaReferencia),
      'Reversión por eliminación de ingreso'
    );
  });
}

export interface EditarIngresoEntrada {
  tenantId: string;
  ingresoId: string;
  /** Siempre positivo — mismo criterio que registrarIngreso. */
  monto: bigint;
  moneda: string;
  nota?: string;
  fechaReferencia?: Date;
}

export interface IngresoEditado {
  id: string;
  movimientoId: string;
  periodoId: string;
  /** true si el ingreso original pertenecía a un periodo ya cerrado. */
  ajusteGenerado: boolean;
}

/**
 * "Edita" un ingreso revirtiendo el original (igual que
 * `eliminarIngreso`) y registrando uno nuevo con el monto corregido —
 * mismo mecanismo que `editarGasto` en modulos/gastos/registrar-gasto.ts.
 */
export async function editarIngreso(entrada: EditarIngresoEntrada): Promise<IngresoEditado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un ingreso debe ser positivo');
  }
  const fechaReferencia = entrada.fechaReferencia ?? new Date();

  return conTenant(entrada.tenantId, async (tx) => {
    const ingresoOriginal = await cargarIngresoParaCorreccionTx(tx, entrada.tenantId, entrada.ingresoId);
    const periodoActivo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia);
    const fecha = fechaISO(fechaReferencia);

    await revertirMovimientoTx(
      tx,
      entrada.tenantId,
      ingresoOriginal.movimientoId,
      periodoActivo.cuentaId,
      fecha,
      'Reversión por edición de ingreso'
    );

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'ingreso',
      moneda: entrada.moneda,
      fechaEfectiva: fecha,
      nota: entrada.nota,
      partidas: [
        { cuentaId: periodoActivo.cuentaId, montoValorMinimo: entrada.monto },
        { cuentaId: null, montoValorMinimo: -entrada.monto },
      ],
    });

    const [ingresoNuevo] = await tx
      .insert(ingresos)
      .values({ tenantId: entrada.tenantId, periodoId: periodoActivo.id, movimientoId })
      .returning({ id: ingresos.id });
    if (!ingresoNuevo) throw new Error('No se pudo registrar el ingreso corregido');

    return {
      id: ingresoNuevo.id,
      movimientoId,
      periodoId: periodoActivo.id,
      ajusteGenerado: periodoActivo.id !== ingresoOriginal.periodoId,
    };
  });
}

export interface IngresoDetallado {
  id: string;
  periodoId: string;
  montoValorMinimo: bigint;
  moneda: string;
  fechaEfectiva: string;
  fechaRegistro: Date;
  nota: string | null;
  /** true si `editarIngreso`/`eliminarIngreso` ya generaron una reversión de este ingreso — mismo criterio que `GastoDetallado.revertido`. */
  revertido: boolean;
}

/**
 * openapi.yaml `GET /periodos/{periodoId}/ingresos`: sin paginación (a
 * diferencia de gastos, que sí la define) — un periodo tiene "cero o
 * varios" ingresos (invariante 12), casi siempre pocos, así que el
 * contrato no la pidió.
 *
 * `montoValorMinimo` sale de la pata del asiento con `cuentaId` no nulo
 * (la que sí representa una cuenta real, ver comentario de `cuentaId`
 * en db/schema/ledger.ts): para un ingreso siempre es positiva, por
 * construcción de `registrarIngreso` — no hace falta `abs()`.
 */
export async function listarIngresos(
  tenantId: string,
  periodoId: string,
  fechaReferencia: Date = new Date()
): Promise<IngresoDetallado[]> {
  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia);
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }

    const filas = await tx
      .select({
        id: ingresos.id,
        movimientoId: ingresos.movimientoId,
        montoValorMinimo: asientos.montoValorMinimo,
        moneda: movimientos.moneda,
        fechaEfectiva: movimientos.fechaEfectiva,
        fechaRegistro: movimientos.fechaRegistro,
        nota: movimientos.nota,
      })
      .from(ingresos)
      .innerJoin(movimientos, eq(movimientos.id, ingresos.movimientoId))
      .innerJoin(asientos, and(eq(asientos.movimientoId, ingresos.movimientoId), isNotNull(asientos.cuentaId)))
      .where(and(eq(ingresos.tenantId, tenantId), eq(ingresos.periodoId, periodoId)))
      .orderBy(desc(movimientos.fechaRegistro));

    // Segunda consulta, no un JOIN — mismo motivo que en listarGastos.
    const movimientoIds = filas.map((fila) => fila.movimientoId);
    const revertidos =
      movimientoIds.length === 0
        ? []
        : await tx
            .select({ movimientoRevertidoId: movimientos.movimientoRevertidoId })
            .from(movimientos)
            .where(and(eq(movimientos.tenantId, tenantId), inArray(movimientos.movimientoRevertidoId, movimientoIds)));
    const idsRevertidos = new Set(revertidos.map((fila) => fila.movimientoRevertidoId));

    return filas.map((fila) => ({
      id: fila.id,
      periodoId,
      montoValorMinimo: fila.montoValorMinimo,
      moneda: fila.moneda,
      fechaEfectiva: fila.fechaEfectiva,
      fechaRegistro: fila.fechaRegistro,
      nota: fila.nota,
      revertido: idsRevertidos.has(fila.movimientoId),
    }));
  });
}
