import { and, eq } from 'drizzle-orm';
import { ingresos } from '../../db/schema/ingresos.js';
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
    const periodo = await obtenerPeriodoPorIdTx(tx, entrada.tenantId, entrada.periodoId);
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
