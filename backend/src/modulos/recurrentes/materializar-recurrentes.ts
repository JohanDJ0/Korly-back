import type { Ejecutor } from '../../shared/db.js';
import { listarGastosRecurrentesActivosTx, materializarUnRecurrenteTx } from './recurrentes.js';

/**
 * Se llama exactamente en los dos puntos donde un periodo se vuelve
 * genuinamente `'activo'` (nunca para uno que se crea en `'borrador'`,
 * que todavía no es "el periodo siguiente" — ver crear-periodo.ts):
 * justo al lado de `reclamarArrastresTx`, mismo criterio. Por cada
 * recurrente activo, `materializarUnRecurrenteTx` (recurrentes.ts)
 * decide si le toca a este periodo y genera el gasto real si es así —
 * la misma función que usa `crearGastoRecurrente` para el caso de un
 * recurrente creado mientras el periodo al que le toca ya está activo
 * (ver el comentario ahí).
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
    await materializarUnRecurrenteTx(tx, tenantId, periodo, recurrente);
  }
}
