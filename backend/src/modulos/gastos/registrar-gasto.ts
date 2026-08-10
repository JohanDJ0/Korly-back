import { gastos } from '../../db/schema/gastos.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';

export interface RegistrarGastoEntrada {
  tenantId: string;
  periodoId: string;
  /** Siempre positivo — el signo hacia la cuenta del periodo lo aplica esta función, no el caller. */
  monto: bigint;
  moneda: string;
  /** 'YYYY-MM-DD'. Por defecto, la fecha actual la resuelve el caller (no hay capa HTTP todavía que la infiera). */
  fechaEfectiva: string;
  nota?: string;
}

export interface GastoRegistrado {
  id: string;
  movimientoId: string;
}

/**
 * Registra un gasto contra un periodo, en una sola transacción — mismo
 * patrón que registrarIngreso (ver modulos/ingresos/registrar-ingreso.ts),
 * con el signo de la partida invertido: un gasto reduce el saldo de la
 * cuenta del periodo en vez de aumentarlo.
 *
 * El periodo destino debe estar Activo (openapi.yaml, invariante 10 de
 * modelo-dominio.md).
 */
export async function registrarGasto(entrada: RegistrarGastoEntrada): Promise<GastoRegistrado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un gasto debe ser positivo');
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
      tipo: 'gasto',
      moneda: entrada.moneda,
      fechaEfectiva: entrada.fechaEfectiva,
      nota: entrada.nota,
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: null, montoValorMinimo: entrada.monto },
      ],
    });

    const [gasto] = await tx
      .insert(gastos)
      .values({ tenantId: entrada.tenantId, periodoId: entrada.periodoId, movimientoId })
      .returning({ id: gastos.id });
    if (!gasto) throw new Error('No se pudo registrar el gasto');

    return { id: gasto.id, movimientoId };
  });
}
