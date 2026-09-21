import { and, eq, lt } from 'drizzle-orm';
import { resumenes } from '../../db/schema/cierre.js';
import { metas } from '../../db/schema/metas.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { ahoraEnMexico } from '../../shared/fechas.js';
import { esUuidValido } from '../../shared/validacion.js';
import { obtenerResumenTx } from './generar-resumen.js';
import { reclamarArrastreComoAporteMetaTx } from './materializar-arrastre.js';

/** Lo que el usuario elige (openapi.yaml `DecisionSobranteRequest`). Distinto de `EstadoDecisionSobrante`, que es lo que queda guardado. */
export type DecisionSobranteEntrada = 'ahorrar' | 'arrastrar';

export interface DecisionSobranteResultado {
  periodoId: string;
  decision: 'ahorrado' | 'arrastrado';
  montoAplicadoValorMinimo: bigint;
}

/**
 * Decisión explícita del usuario sobre un sobrante positivo pendiente
 * (modelo-dominio.md §3). Un déficit nunca llega aquí: se decide solo,
 * automáticamente, al generar el resumen (ver generar-resumen.ts).
 *
 * **`'ahorrar'` ya está implementado — ver README, "Metas de ahorro"
 * para el diseño completo.** `metaId` (openapi.yaml
 * `DecisionSobranteRequest.metaId`, "requerido si decision = ahorrar")
 * se valida aquí: sin él, o si la meta no existe/no es de este tenant,
 * se rechaza antes de tocar `resumenes`. El reclamo hacia la cuenta de
 * la meta ocurre en la MISMA transacción que marca `decisionSobrante =
 * 'ahorrado'` — a diferencia de `'arrastrar'` (perezoso, espera al
 * periodo siguiente), la meta ya existe ahora mismo, no hay nada que
 * esperar.
 */
export async function decidirSobrante(
  tenantId: string,
  periodoId: string,
  decision: DecisionSobranteEntrada,
  metaId?: string,
  fechaReferencia: Date = ahoraEnMexico()
): Promise<DecisionSobranteResultado> {
  if (decision === 'ahorrar' && !metaId) {
    throw new ErrorDominio('VALIDACION', "El campo 'metaId' es obligatorio para decidir 'ahorrar'");
  }

  return conTenant(tenantId, async (tx) => {
    const resumen = await obtenerResumenTx(tx, tenantId, periodoId);
    if (!resumen) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo no existe o todavía no tiene un resumen (¿ya está cerrado?)');
    }
    if (resumen.decisionSobrante !== 'pendiente' || resumen.sobranteValorMinimo <= 0n) {
      // sobranteValorMinimo <= 0 nunca debería quedar 'pendiente' (se
      // decide solo al generar el resumen) — el chequeo es cinturón y
      // tirantes, no el camino esperado.
      throw new ErrorDominio('SOBRANTE_YA_DECIDIDO', 'El sobrante de este periodo no está pendiente de decisión');
    }

    const meta = decision === 'ahorrar' ? await obtenerMetaParaReclamoTx(tx, tenantId, metaId!) : null;
    if (decision === 'ahorrar' && !meta) {
      throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    }

    const decisionGuardada = decision === 'ahorrar' ? 'ahorrado' : 'arrastrado';

    // UPDATE ... WHERE decision_sobrante = 'pendiente': si algo más
    // (el barrido de N días, u otra request) decidió entre el SELECT de
    // arriba y este UPDATE, aquí no afecta ninguna fila — se detecta
    // por 0 resultados, no por una excepción del trigger de la migración.
    const [actualizado] = await tx
      .update(resumenes)
      .set({ decisionSobrante: decisionGuardada, decisionSobranteFecha: new Date() })
      .where(and(eq(resumenes.id, resumen.id), eq(resumenes.decisionSobrante, 'pendiente')))
      .returning({ id: resumenes.id });

    if (!actualizado) {
      throw new ErrorDominio('SOBRANTE_YA_DECIDIDO', 'El sobrante de este periodo ya fue decidido');
    }

    if (meta) {
      await reclamarArrastreComoAporteMetaTx(tx, tenantId, resumen.id, meta.id, meta.cuentaId, fechaReferencia);
    }

    return { periodoId, decision: decisionGuardada, montoAplicadoValorMinimo: resumen.sobranteValorMinimo };
  });
}

/**
 * Lee `db/schema/metas.ts` directamente, no `modulos/metas/metas.ts` —
 * deliberado, mismo motivo que ya documenta el README para
 * `cierre`/`periodos`: `modulos/metas/metas.ts` importa
 * `obtenerPeriodoActivoTx` de `modulos/periodos/crear-periodo.ts`, que a
 * su vez importa `resolverPendientesTx`/`reclamarArrastresTx` de este
 * mismo módulo `cierre` — importar el módulo completo de metas desde
 * aquí cerraría ese ciclo. `tenantId` en el `WHERE` es la misma defensa
 * en profundidad que el resto (RLS es la autoridad real).
 */
async function obtenerMetaParaReclamoTx(tx: Ejecutor, tenantId: string, metaId: string): Promise<{ id: string; cuentaId: string } | null> {
  if (!esUuidValido(metaId)) return null;

  const [fila] = await tx
    .select({ id: metas.id, cuentaId: metas.cuentaId })
    .from(metas)
    .where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId)))
    .limit(1);
  return fila ?? null;
}

/**
 * Barrido de N días (modelo-dominio.md §3: "si el usuario no decide...
 * default: arrastrar automáticamente"). N = 7 días: propuesta propia,
 * no viene de ningún documento — ver README para la justificación y la
 * advertencia de que debe revisarse con datos reales de uso.
 *
 * `Tx` únicamente: se llama desde `resolverPendientesTx`
 * (cerrar-periodo.ts), en el mismo punto de entrada perezoso que cierra
 * periodos vencidos — no tiene entrada propia porque no hay nada que un
 * caller externo necesite disparar a mano.
 */
export async function resolverDecisionesVencidasTx(tx: Ejecutor, tenantId: string, diasLimite: number, fechaReferencia: Date): Promise<void> {
  const limite = new Date(fechaReferencia.getTime() - diasLimite * 24 * 60 * 60 * 1000);

  await tx
    .update(resumenes)
    .set({ decisionSobrante: 'arrastrado', decisionSobranteFecha: fechaReferencia })
    .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.decisionSobrante, 'pendiente'), lt(resumenes.generadoEn, limite)));
}
