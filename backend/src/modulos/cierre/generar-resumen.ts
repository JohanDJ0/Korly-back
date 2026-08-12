import { and, eq } from 'drizzle-orm';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { resumenes, type EstadoDecisionSobrante } from '../../db/schema/cierre.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';

export interface ResumenGenerado {
  id: string;
  periodoId: string;
  totalIngresosValorMinimo: bigint;
  totalGastadoValorMinimo: bigint;
  sobranteValorMinimo: bigint;
  moneda: string;
  decisionSobrante: EstadoDecisionSobrante;
  decisionSobranteFecha: Date | null;
  generadoEn: Date;
}

/**
 * Genera el resumen inmutable de un periodo (modelo-dominio.md §1, §3) y
 * decide automáticamente el caso de déficit — nunca pide "ahorrar" una
 * deuda (modelo-dominio.md §3, "resuelto en revisión, ver §6"). Un
 * sobrante positivo queda `'pendiente'`: lo resuelve
 * `modulos/cierre/decidir-sobrante.ts`, por decisión explícita del
 * usuario o por el barrido de N días.
 *
 * Siempre `Tx`: quien llama ya tiene una transacción abierta (cerrar un
 * periodo cambia `periodos.estado` Y genera el resumen — deben
 * confirmarse juntos o no confirmarse ninguno).
 *
 * `fechaReferencia` se recibe como parámetro, nunca `new Date()` interno
 * — mismo principio que los jobs idempotentes de ADR-004 ("fecha
 * objetivo pasada como parámetro, nunca now() dentro del job") aplicado
 * aquí a `generadoEn`. Además de la consistencia, es lo que hace
 * posible probar el barrido de N días (decidir-sobrante.ts) sin
 * depender del reloj real de la máquina que corre los tests.
 */
export async function generarResumenTx(
  tx: Ejecutor,
  tenantId: string,
  periodoId: string,
  cuentaId: string,
  fechaReferencia: Date
): Promise<ResumenGenerado> {
  const { totalIngresosValorMinimo, totalGastadoValorMinimo, moneda } = await calcularTotalesTx(tx, cuentaId);
  const sobranteValorMinimo = totalIngresosValorMinimo - totalGastadoValorMinimo;

  const esDeficit = sobranteValorMinimo < 0n;

  const [resumen] = await tx
    .insert(resumenes)
    .values({
      tenantId,
      periodoId,
      totalIngresosValorMinimo,
      totalGastadoValorMinimo,
      sobranteValorMinimo,
      moneda,
      decisionSobrante: esDeficit ? 'arrastrado' : 'pendiente',
      decisionSobranteFecha: esDeficit ? fechaReferencia : null,
      generadoEn: fechaReferencia,
    })
    .returning();

  if (!resumen) throw new Error('No se pudo generar el resumen del periodo');

  return {
    ...resumen,
    decisionSobrante: resumen.decisionSobrante as EstadoDecisionSobrante,
  };
}

/** Variante top-level para callers que no ya tienen una transacción abierta (la capa HTTP). */
export async function obtenerResumen(tenantId: string, periodoId: string): Promise<ResumenGenerado | null> {
  return conTenant(tenantId, (tx) => obtenerResumenTx(tx, tenantId, periodoId));
}

export async function obtenerResumenTx(tx: Ejecutor, tenantId: string, periodoId: string): Promise<ResumenGenerado | null> {
  const [fila] = await tx
    .select()
    .from(resumenes)
    .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodoId)))
    .limit(1);

  return fila ? { ...fila, decisionSobrante: fila.decisionSobrante as EstadoDecisionSobrante } : null;
}

interface TotalesPeriodo {
  totalIngresosValorMinimo: bigint;
  totalGastadoValorMinimo: bigint;
  moneda: string;
}

/**
 * `totalGastado` incluye solo movimientos `tipo = 'gasto'` — no
 * `'aporte_meta'`, que modelo-dominio.md §6 también resta del
 * disponible. No es un descuido: `aporte_meta` no existe todavía
 * (Metas está fuera del walking skeleton), así que ningún movimiento de
 * ese tipo puede aparecer aquí hoy. Cuando exista, esta función necesita
 * decidir si lo reporta junto con `totalGastado` o aparte — decisión de
 * producto, no algo que resolver ahora sin ese módulo enfrente.
 *
 * `moneda`: en la práctica siempre 'MXN' (multi-moneda fuera del MVP,
 * documento-maestro-v2.md §4.2), pero nada en el schema lo obliga
 * todavía. Si un periodo no tuvo ningún movimiento, no hay de dónde
 * derivarla — se usa 'MXN' como default explícito en vez de inventar un
 * concepto de "moneda del tenant" que no existe en ningún otro lado.
 */
async function calcularTotalesTx(tx: Ejecutor, cuentaId: string): Promise<TotalesPeriodo> {
  const filas = await tx
    .select({
      tipo: movimientos.tipo,
      moneda: asientos.moneda,
      suma: asientos.montoValorMinimo,
    })
    .from(asientos)
    .innerJoin(movimientos, eq(asientos.movimientoId, movimientos.id))
    .where(eq(asientos.cuentaId, cuentaId));

  let totalIngresosValorMinimo = 0n;
  let totalGastadoValorMinimo = 0n;
  const monedas = new Set<string>();

  for (const fila of filas) {
    monedas.add(fila.moneda);
    if (fila.tipo === 'ingreso') {
      totalIngresosValorMinimo += fila.suma;
    } else if (fila.tipo === 'gasto') {
      // Los gastos llegan a la cuenta del periodo como partidas
      // negativas (registrar-gasto.ts); totalGastado se reporta como
      // magnitud positiva.
      totalGastadoValorMinimo += -fila.suma;
    }
  }

  if (monedas.size > 1) {
    throw new Error(`La cuenta ${cuentaId} mezcla más de una moneda entre sus movimientos (fuera de alcance del MVP)`);
  }

  return {
    totalIngresosValorMinimo,
    totalGastadoValorMinimo,
    moneda: monedas.values().next().value ?? 'MXN',
  };
}
