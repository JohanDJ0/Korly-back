import { and, asc, eq } from 'drizzle-orm';
import { type TipoMovimiento } from '../../db/schema/ledger.js';
import { resumenes, type EstadoDecisionSobrante } from '../../db/schema/cierre.js';
import { obtenerNetoPorTipoEfectivoTx } from '../ledger/registrar-movimiento.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { esUuidValido } from '../../shared/validacion.js';

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
  if (!esUuidValido(periodoId)) return null;

  const [fila] = await tx
    .select()
    .from(resumenes)
    .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.periodoId, periodoId)))
    .limit(1);

  return fila ? { ...fila, decisionSobrante: fila.decisionSobrante as EstadoDecisionSobrante } : null;
}

/**
 * El resumen `'pendiente'` más antiguo del tenant, si hay alguno —
 * usado para avisar proactivamente en el frontend (ver
 * frontend/README.md, "Qué falta": "nada le avisa al usuario"; hueco
 * real, encontrado por el usuario probando la app: cerró un periodo,
 * creó el siguiente sin decidir el sobrante, y sin este aviso parecía
 * que el dinero simplemente había desaparecido — aunque
 * `resolverDecisionesVencidasTx` ya garantizaba que a los N días se
 * arrastra solo, nunca se pierde).
 *
 * El más antiguo, no cualquiera: si llegaran a acumularse varios
 * (cerrar periodos repetidamente sin decidir ninguno), es el que menos
 * le queda antes de que el barrido de N días lo decida por el usuario —
 * el más urgente de mostrar.
 */
export async function obtenerResumenPendiente(tenantId: string): Promise<ResumenGenerado | null> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select()
      .from(resumenes)
      .where(and(eq(resumenes.tenantId, tenantId), eq(resumenes.decisionSobrante, 'pendiente')))
      .orderBy(asc(resumenes.generadoEn))
      .limit(1);

    return fila ? { ...fila, decisionSobrante: fila.decisionSobrante as EstadoDecisionSobrante } : null;
  });
}

interface TotalesPeriodo {
  totalIngresosValorMinimo: bigint;
  totalGastadoValorMinimo: bigint;
  moneda: string;
}

/**
 * Tipos que suman como "ingreso" o "gasto" para efectos del resumen —
 * deliberadamente exhaustivo sobre `TIPOS_MOVIMIENTO` (sin contar
 * `'reversion'`, que `obtenerNetoPorTipoEfectivoTx` ya resuelve al tipo
 * de lo que revierte antes de llegar aquí): un tipo nuevo que se le
 * agregue al ledger sin clasificarlo aquí debe fallar fuerte, no
 * perderse en silencio (ver el bug de abajo).
 *
 * `'arrastre_sobrante'` cuenta como ingreso porque, en el momento en que
 * ESTE periodo genera SU PROPIO resumen, cualquier asiento de ese tipo
 * en su cuenta solo puede ser un arrastre que heredó al crearse
 * (`reclamarArrastresTx`) — el asiento de SALIDA que drena su propio
 * sobrante se registra después de este cálculo, no antes (ver
 * `cerrarYGenerarResumenTx`). `'aporte_meta'` cuenta como gasto y
 * `'retiro_meta'` como ingreso — modelo-dominio.md §6: "el aporte se
 * trata como un gasto más"; el retiro es su simétrico.
 */
const TIPOS_INGRESO: ReadonlySet<TipoMovimiento> = new Set(['ingreso', 'retiro_meta', 'arrastre_sobrante']);
// 'pago_tarjeta' (modulos/tarjetas/materializar-pagos-tarjeta.ts) baja
// el disponible de la quincena exactamente igual que un gasto — el
// chequeo exhaustivo de abajo (throw en cualquier tipo no clasificado)
// es lo que obligó a no olvidar este caso al agregar tarjetas.
// 'cargo_tarjeta' NO aparece aquí a propósito: nunca postea un asiento
// contra `periodo.cuentaId` (solo contra la cuenta de la tarjeta), así
// que el resumen de un periodo nunca se entera de que existió.
const TIPOS_GASTO: ReadonlySet<TipoMovimiento> = new Set(['gasto', 'aporte_meta', 'pago_tarjeta']);

/**
 * **Bug real, encontrado antes de construir Metas — no hipotético.**
 * La versión anterior solo sumaba `tipo = 'ingreso'`/`'gasto'` desde
 * `movimientos`/`asientos` directo. Un periodo que **hereda un
 * arrastre** (créditado con `tipo = 'arrastre_sobrante'` al crearse) y
 * luego cierra con su propia actividad calculaba un sobrante que
 * ignoraba por completo ese arrastre heredado — el saldo real de la
 * cuenta y `totalIngresos - totalGastado` divergían. Al drenar, el
 * periodo cerrado quedaba con el arrastre heredado atorado para
 * siempre (nunca llegaba al periodo siguiente): dinero perdido en un
 * ciclo de vida normal de dos o más periodos consecutivos, sin que
 * hiciera falta Metas para disparrarlo. Confirmado con un test antes
 * del fix (`sobranteValorMinimo` daba 300 en vez de 1300, saldo
 * heredado de 1000 nunca drenado).
 *
 * **Corregido usando `obtenerNetoPorTipoEfectivoTx`**: agrupa TODOS los
 * asientos de la cuenta por su tipo efectivo (una reversión ya resuelta
 * al tipo de lo que revierte), y clasifica cada uno como ingreso o
 * gasto vía `TIPOS_INGRESO`/`TIPOS_GASTO` de arriba — nunca se limita a
 * una lista fija de dos tipos. Esto garantiza, por construcción, que
 * `totalIngresos - totalGastado` siempre sea exactamente el saldo real
 * de la cuenta (invariante ahora verificado con un test que compara
 * contra `obtenerSaldoCuenta` directamente), así que drenar SIEMPRE
 * deja el periodo cerrado en 0.
 *
 * `moneda`: en la práctica siempre 'MXN' (multi-moneda fuera del MVP,
 * documento-maestro-v2.md §4.2), pero nada en el schema lo obliga
 * todavía — de ahí el chequeo explícito de abajo (mismo que ya existía
 * antes de este fix, preservado). Si la cuenta no tuvo ningún
 * movimiento, no hay de dónde derivarla — se usa 'MXN' como default.
 */
async function calcularTotalesTx(tx: Ejecutor, cuentaId: string): Promise<TotalesPeriodo> {
  const netosPorTipo = await obtenerNetoPorTipoEfectivoTx(tx, cuentaId);

  let totalIngresosValorMinimo = 0n;
  let totalGastadoValorMinimo = 0n;
  const monedas = new Set<string>();

  for (const { tipoEfectivo, moneda, neto } of netosPorTipo) {
    monedas.add(moneda);
    if (TIPOS_INGRESO.has(tipoEfectivo)) {
      totalIngresosValorMinimo += neto;
    } else if (TIPOS_GASTO.has(tipoEfectivo)) {
      // Los gastos (y aportes a meta) llegan como partidas negativas;
      // totalGastado se reporta como magnitud positiva.
      totalGastadoValorMinimo += -neto;
    } else {
      throw new Error(`Tipo de movimiento no clasificado para el resumen de cierre: '${tipoEfectivo}'`);
    }
  }

  if (monedas.size > 1) {
    throw new Error(`La cuenta ${cuentaId} mezcla más de una moneda entre sus movimientos (fuera de alcance del MVP)`);
  }

  return { totalIngresosValorMinimo, totalGastadoValorMinimo, moneda: monedas.values().next().value ?? 'MXN' };
}
