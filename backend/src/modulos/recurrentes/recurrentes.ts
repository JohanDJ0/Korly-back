import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { gastos } from '../../db/schema/gastos.js';
import { FRECUENCIAS_RECURRENTE, gastosRecurrentes, type FrecuenciaRecurrente } from '../../db/schema/gastos-recurrentes.js';
import { periodos } from '../../db/schema/periodos.js';
import { obtenerCategoriaPorIdTx } from '../categorias/categorias.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { fechaISO } from '../../shared/fechas.js';
import { esUuidValido } from '../../shared/validacion.js';

export interface GastoRecurrente {
  id: string;
  descripcion: string;
  montoValorMinimo: bigint;
  moneda: string;
  categoriaId: string | null;
  frecuencia: FrecuenciaRecurrente;
  diaMes: number | null;
  activo: boolean;
}

const COLUMNAS_RECURRENTE = {
  id: gastosRecurrentes.id,
  descripcion: gastosRecurrentes.descripcion,
  montoValorMinimo: gastosRecurrentes.montoValorMinimo,
  moneda: gastosRecurrentes.moneda,
  categoriaId: gastosRecurrentes.categoriaId,
  frecuencia: gastosRecurrentes.frecuencia,
  diaMes: gastosRecurrentes.diaMes,
  activo: gastosRecurrentes.activo,
} as const;

/**
 * Mismo criterio "cinturón y tirantes" que `resolverCategoriaIdTx` en
 * registrar-gasto.ts: valida contra este tenant antes de insertar, en
 * vez de confiar solo en la FK (que daría un error genérico de Postgres,
 * no `CATEGORIA_NO_ENCONTRADA`).
 */
async function resolverCategoriaIdTx(tx: Ejecutor, tenantId: string, categoriaId: string | null | undefined): Promise<string | null> {
  if (categoriaId === undefined || categoriaId === null) return null;
  const categoria = await obtenerCategoriaPorIdTx(tx, tenantId, categoriaId);
  if (!categoria) {
    throw new ErrorDominio('CATEGORIA_NO_ENCONTRADA', 'La categoría especificada no existe');
  }
  return categoria.id;
}

/**
 * `diaMes` obligatorio solo para `'mensual'` — mismo par de invariantes
 * que el CHECK `gastos_recurrentes_dia_mes_coherente` en el schema, aquí
 * para dar un `ErrorDominio` legible en vez de dejar que la validación
 * la reporte Postgres como un 500 genérico.
 */
function validarFrecuenciaYDia(frecuencia: string, diaMes: number | null | undefined): { frecuencia: FrecuenciaRecurrente; diaMes: number | null } {
  if (!FRECUENCIAS_RECURRENTE.includes(frecuencia as FrecuenciaRecurrente)) {
    throw new ErrorDominio('VALIDACION', `Frecuencia no soportada: ${frecuencia}`);
  }
  if (frecuencia === 'mensual') {
    if (diaMes === null || diaMes === undefined || !Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) {
      throw new ErrorDominio('VALIDACION', "El campo 'diaMes' es obligatorio (1-31) cuando la frecuencia es 'mensual'");
    }
    return { frecuencia: frecuencia as FrecuenciaRecurrente, diaMes };
  }
  if (diaMes !== null && diaMes !== undefined) {
    throw new ErrorDominio('VALIDACION', "El campo 'diaMes' solo aplica cuando la frecuencia es 'mensual'");
  }
  return { frecuencia: frecuencia as FrecuenciaRecurrente, diaMes: null };
}

/**
 * `diaMes<=15` cae siempre en la primera mitad del mes (1-15) y
 * `diaMes>=16` en la segunda (16-fin) — ADR-004 ancla los periodos al
 * calendario, así que un cargo mensual con día fijo siempre aterriza en
 * la misma mitad, nunca en las dos. Comparar contra el día de
 * `fechaInicio` (que solo puede ser `1` o `16`, ver
 * modulos/periodos/calcular-quincena.ts) evita el caso especial de "el
 * día 31 no existe en abril": ese cargo simplemente se materializa en
 * la segunda mitad de abril, igual que lo haría cualquier cobro real
 * de fin de mes. Vive aquí (no en materializar-recurrentes.ts) para
 * que `crearGastoRecurrente`, abajo, pueda reusarla sin crear un ciclo
 * de imports (materializar-recurrentes.ts ya importa de este archivo,
 * nunca al revés).
 */
export function debeMaterializarEnEstePeriodo(recurrente: GastoRecurrente, fechaInicioPeriodo: string): boolean {
  if (recurrente.frecuencia === 'quincenal') return true;
  const diaInicioPeriodo = Number(fechaInicioPeriodo.slice(-2));
  return recurrente.diaMes! <= 15 ? diaInicioPeriodo === 1 : diaInicioPeriodo === 16;
}

/**
 * Genera el gasto real (mismas partidas que `registrarGasto`) para un
 * recurrente en un periodo, si de verdad le toca — usada tanto por
 * `materializarRecurrentesTx` (al activarse un periodo) como por
 * `crearGastoRecurrente` (ver comentario ahí sobre el hallazgo real que
 * motivó esto).
 */
export async function materializarUnRecurrenteTx(
  tx: Ejecutor,
  tenantId: string,
  periodo: { id: string; cuentaId: string; fechaInicio: string },
  recurrente: GastoRecurrente
): Promise<void> {
  if (!debeMaterializarEnEstePeriodo(recurrente, periodo.fechaInicio)) return;

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

export interface CrearGastoRecurrenteEntrada {
  tenantId: string;
  descripcion: string;
  montoValorMinimo: bigint;
  moneda: string;
  categoriaId?: string | null;
  frecuencia: string;
  diaMes?: number | null;
  fechaReferencia?: Date;
}

/**
 * **Hallazgo real:** `materializarRecurrentesTx` solo corre en los dos
 * momentos en que un periodo se vuelve activo — un recurrente creado
 * DESPUÉS, mientras ese periodo ya está activo, nunca tenía otra
 * oportunidad de materializarse en él, aunque su fecha le tocara
 * exactamente a ese periodo (p. ej. crear hoy, día 16, un recurrente
 * mensual con `diaMes: 17`, para el periodo 16-fin que ya está activo
 * desde antes). Corregido comprobando, aquí mismo, si hay un periodo
 * activo al que le toque de inmediato — mismo criterio de "una sola
 * vez, nunca doble materialización" que ya vale para el camino
 * original: un periodo que ya está activo no vuelve a pasar por
 * `crearPeriodo`/la promoción de borrador, así que no hay forma de que
 * esto y la materialización original choquen para el mismo periodo.
 */
export async function crearGastoRecurrente(entrada: CrearGastoRecurrenteEntrada): Promise<GastoRecurrente> {
  const descripcionLimpia = entrada.descripcion.trim();
  if (descripcionLimpia.length === 0) {
    throw new ErrorDominio('VALIDACION', "El campo 'descripcion' no puede estar vacío");
  }
  if (entrada.montoValorMinimo <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un gasto recurrente debe ser positivo');
  }
  const { frecuencia, diaMes } = validarFrecuenciaYDia(entrada.frecuencia, entrada.diaMes);
  const fechaReferencia = entrada.fechaReferencia ?? new Date();

  return conTenant(entrada.tenantId, async (tx) => {
    const categoriaId = await resolverCategoriaIdTx(tx, entrada.tenantId, entrada.categoriaId);

    const [recurrente] = await tx
      .insert(gastosRecurrentes)
      .values({
        tenantId: entrada.tenantId,
        descripcion: descripcionLimpia,
        montoValorMinimo: entrada.montoValorMinimo,
        moneda: entrada.moneda,
        categoriaId,
        frecuencia,
        diaMes,
      })
      .returning(COLUMNAS_RECURRENTE);
    if (!recurrente) throw new Error('No se pudo crear el gasto recurrente');

    // `fechaFin >= hoy` además de `estado = 'activo'`: sin resolver el
    // cierre perezoso aquí (importar eso crearía un ciclo con
    // cierre/cerrar-periodo.ts, que ya importa este módulo), esto evita
    // el caso raro de materializar contra un periodo vencido que
    // todavía no se cerró porque nadie lo ha vuelto a consultar.
    const [periodoActivo] = await tx
      .select({ id: periodos.id, cuentaId: periodos.cuentaId, fechaInicio: periodos.fechaInicio })
      .from(periodos)
      .where(and(eq(periodos.tenantId, entrada.tenantId), eq(periodos.estado, 'activo'), gte(periodos.fechaFin, fechaISO(fechaReferencia))))
      .limit(1);
    if (periodoActivo) {
      await materializarUnRecurrenteTx(tx, entrada.tenantId, periodoActivo, recurrente as GastoRecurrente);
    }

    return recurrente as GastoRecurrente;
  });
}

/** Activos primero, más reciente primero dentro de cada grupo — orden estable para un listado con pausados al final. */
export async function listarGastosRecurrentes(tenantId: string): Promise<GastoRecurrente[]> {
  return conTenant(tenantId, async (tx) => {
    const filas = await tx
      .select(COLUMNAS_RECURRENTE)
      .from(gastosRecurrentes)
      .where(eq(gastosRecurrentes.tenantId, tenantId))
      .orderBy(desc(gastosRecurrentes.activo), desc(gastosRecurrentes.creadoEn));
    return filas as GastoRecurrente[];
  });
}

async function obtenerGastoRecurrentePorIdTx(tx: Ejecutor, tenantId: string, id: string): Promise<GastoRecurrente | null> {
  if (!esUuidValido(id)) return null;

  const [fila] = await tx
    .select(COLUMNAS_RECURRENTE)
    .from(gastosRecurrentes)
    .where(and(eq(gastosRecurrentes.tenantId, tenantId), eq(gastosRecurrentes.id, id)))
    .limit(1);
  return (fila as GastoRecurrente) ?? null;
}

export interface ActualizarGastoRecurrenteEntrada {
  tenantId: string;
  id: string;
  descripcion?: string;
  montoValorMinimo?: bigint;
  moneda?: string;
  categoriaId?: string | null;
  frecuencia?: string;
  diaMes?: number | null;
  activo?: boolean;
}

/**
 * Es una plantilla, no un hecho del ledger — a diferencia de
 * gastos/ingresos, editarla actualiza la misma fila en vez de generar
 * una nueva (no hay nada que "revertir": los gastos ya materializados
 * son filas de `gastos` independientes que no cambian con esto). Un
 * cambio de monto/frecuencia solo afecta materializaciones futuras.
 */
export async function actualizarGastoRecurrente(entrada: ActualizarGastoRecurrenteEntrada): Promise<GastoRecurrente> {
  return conTenant(entrada.tenantId, async (tx) => {
    const existente = await obtenerGastoRecurrentePorIdTx(tx, entrada.tenantId, entrada.id);
    if (!existente) {
      throw new ErrorDominio('RECURRENTE_NO_ENCONTRADO', 'El gasto recurrente especificado no existe');
    }

    const descripcion = entrada.descripcion !== undefined ? entrada.descripcion.trim() : existente.descripcion;
    if (descripcion.length === 0) {
      throw new ErrorDominio('VALIDACION', "El campo 'descripcion' no puede estar vacío");
    }
    const montoValorMinimo = entrada.montoValorMinimo ?? existente.montoValorMinimo;
    if (montoValorMinimo <= 0n) {
      throw new ErrorDominio('VALIDACION', 'El monto de un gasto recurrente debe ser positivo');
    }
    const frecuenciaEntrada = entrada.frecuencia ?? existente.frecuencia;
    // `diaMes` solo se arrastra del valor viejo si la frecuencia no
    // cambia — cambiar de 'mensual' a 'quincenal' (o viceversa) sin
    // mandar `diaMes` explícito no debe heredar un valor que ya no
    // tiene el mismo sentido bajo la frecuencia nueva.
    const cambiaFrecuencia = entrada.frecuencia !== undefined && entrada.frecuencia !== existente.frecuencia;
    const diaMesEntrada = entrada.diaMes !== undefined ? entrada.diaMes : cambiaFrecuencia ? null : existente.diaMes;
    const { frecuencia, diaMes } = validarFrecuenciaYDia(frecuenciaEntrada, diaMesEntrada);
    const categoriaId = entrada.categoriaId !== undefined ? await resolverCategoriaIdTx(tx, entrada.tenantId, entrada.categoriaId) : existente.categoriaId;

    const [actualizado] = await tx
      .update(gastosRecurrentes)
      .set({
        descripcion,
        montoValorMinimo,
        moneda: entrada.moneda ?? existente.moneda,
        categoriaId,
        frecuencia,
        diaMes,
        activo: entrada.activo ?? existente.activo,
      })
      .where(and(eq(gastosRecurrentes.tenantId, entrada.tenantId), eq(gastosRecurrentes.id, entrada.id)))
      .returning(COLUMNAS_RECURRENTE);
    if (!actualizado) throw new Error('No se pudo actualizar el gasto recurrente');
    return actualizado as GastoRecurrente;
  });
}

/** Usado por `materializarRecurrentesTx` — solo los activos importan para generar gastos nuevos. */
export async function listarGastosRecurrentesActivosTx(tx: Ejecutor, tenantId: string): Promise<GastoRecurrente[]> {
  const filas = await tx
    .select(COLUMNAS_RECURRENTE)
    .from(gastosRecurrentes)
    .where(and(eq(gastosRecurrentes.tenantId, tenantId), eq(gastosRecurrentes.activo, true)))
    .orderBy(asc(gastosRecurrentes.creadoEn));
  return filas as GastoRecurrente[];
}
