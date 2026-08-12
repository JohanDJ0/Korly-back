import { and, eq, lt } from 'drizzle-orm';
import { resumenes } from '../../db/schema/cierre.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { obtenerResumenTx } from './generar-resumen.js';

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
 * `'ahorrar'` está en el tipo de entrada porque así lo define
 * openapi.yaml, pero no está implementado: requiere una meta real
 * (metaId) y el módulo de Metas no existe todavía en el walking
 * skeleton. Rechazarlo aquí, explícito, es mejor que fingir soporte a
 * medias — mismo patrón que `crearPeriodo` con tipos no-quincenales.
 */
export async function decidirSobrante(
  tenantId: string,
  periodoId: string,
  decision: DecisionSobranteEntrada
): Promise<DecisionSobranteResultado> {
  if (decision === 'ahorrar') {
    throw new ErrorDominio('NO_SOPORTADO', 'Ahorrar el sobrante requiere el módulo de metas, que todavía no existe');
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

    // UPDATE ... WHERE decision_sobrante = 'pendiente': si algo más
    // (el barrido de N días, u otra request) decidió entre el SELECT de
    // arriba y este UPDATE, aquí no afecta ninguna fila — se detecta
    // por 0 resultados, no por una excepción del trigger de la migración.
    const [actualizado] = await tx
      .update(resumenes)
      .set({ decisionSobrante: 'arrastrado', decisionSobranteFecha: new Date() })
      .where(and(eq(resumenes.id, resumen.id), eq(resumenes.decisionSobrante, 'pendiente')))
      .returning({ id: resumenes.id });

    if (!actualizado) {
      throw new ErrorDominio('SOBRANTE_YA_DECIDIDO', 'El sobrante de este periodo ya fue decidido');
    }

    return { periodoId, decision: 'arrastrado', montoAplicadoValorMinimo: resumen.sobranteValorMinimo };
  });
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
