import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { ingresos } from '../../db/schema/ingresos.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';

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

export interface IngresoDetallado {
  id: string;
  periodoId: string;
  montoValorMinimo: bigint;
  moneda: string;
  fechaEfectiva: string;
  fechaRegistro: Date;
  nota: string | null;
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

    return filas.map((fila) => ({ ...fila, periodoId }));
  });
}
