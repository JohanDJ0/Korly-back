import { gastos } from '../../db/schema/gastos.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import type { Ejecutor } from '../../shared/db.js';
import { listarGastosRecurrentesActivosTx, type GastoRecurrente } from './recurrentes.js';

/**
 * `diaMes<=15` cae siempre en la primera mitad del mes (1-15) y
 * `diaMes>=16` en la segunda (16-fin) — ADR-004 ancla los periodos al
 * calendario, así que un cargo mensual con día fijo siempre aterriza en
 * la misma mitad, nunca en las dos. Comparar contra el día de
 * `fechaInicio` (que solo puede ser `1` o `16`, ver
 * calcular-quincena.ts) evita el caso especial de "el día 31 no existe
 * en abril": ese cargo simplemente se materializa en la segunda mitad
 * de abril, igual que lo haría cualquier cobro real de fin de mes.
 */
function debeMaterializarEnEstePeriodo(recurrente: GastoRecurrente, fechaInicioPeriodo: string): boolean {
  if (recurrente.frecuencia === 'quincenal') return true;
  const diaInicioPeriodo = Number(fechaInicioPeriodo.slice(-2));
  return recurrente.diaMes! <= 15 ? diaInicioPeriodo === 1 : diaInicioPeriodo === 16;
}

/**
 * Se llama exactamente en los dos puntos donde un periodo se vuelve
 * genuinamente `'activo'` (nunca para uno que se crea en `'borrador'`,
 * que todavía no es "el periodo siguiente" — ver crear-periodo.ts):
 * justo al lado de `reclamarArrastresTx`, mismo criterio. Genera un
 * gasto real (mismas partidas que `registrarGasto`) por cada recurrente
 * activo que le toque a este periodo, marcado con `origenRecurrenteId`
 * para trazabilidad.
 *
 * A diferencia de la carrera de "periodo activo" en `crearPeriodo`
 * (dos requests simultáneas), aquí no hace falta manejar una colisión
 * del índice único parcial `gastos_recurrente_periodo_unico`: esta
 * función solo se invoca una vez, dentro de la misma transacción que
 * crea o promueve el periodo, nunca dos veces para el mismo `periodo.id`.
 * El índice sigue existiendo como invariante de base de datos (defensa
 * en profundidad), pero no hay un camino real que lo dispare.
 */
export async function materializarRecurrentesTx(
  tx: Ejecutor,
  tenantId: string,
  periodo: { id: string; cuentaId: string; fechaInicio: string }
): Promise<void> {
  const recurrentes = await listarGastosRecurrentesActivosTx(tx, tenantId);

  for (const recurrente of recurrentes) {
    if (!debeMaterializarEnEstePeriodo(recurrente, periodo.fechaInicio)) continue;

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId,
      tipo: 'gasto',
      moneda: recurrente.moneda,
      fechaEfectiva: periodo.fechaInicio,
      nota: recurrente.descripcion,
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: -recurrente.montoValorMinimo },
        { cuentaId: null, montoValorMinimo: recurrente.montoValorMinimo },
      ],
    });

    await tx.insert(gastos).values({
      tenantId,
      periodoId: periodo.id,
      movimientoId,
      categoriaId: recurrente.categoriaId,
      origenRecurrenteId: recurrente.id,
    });
  }
}
