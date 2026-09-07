import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { asientos, cuentas, movimientos, type TipoCuenta, type TipoMovimiento } from '../../db/schema/ledger.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';

const movimientoRevertido = alias(movimientos, 'movimiento_revertido');

export interface Partida {
  /** `null` = contraparte externa al sistema (ver comentario en db/schema/ledger.ts). */
  cuentaId: string | null;
  /** Con signo: positivo aumenta el saldo de la cuenta, negativo lo reduce. */
  montoValorMinimo: bigint;
}

export interface RegistrarMovimientoEntrada {
  tenantId: string;
  tipo: TipoMovimiento;
  moneda: string;
  /** 'YYYY-MM-DD' — cuándo ocurrió realmente, no cuándo se registra. */
  fechaEfectiva: string;
  partidas: Partida[];
  nota?: string;
  /**
   * PENDIENTE: el campo y la columna existen (ver movimientoRevertidoId en
   * db/schema/ledger.ts), pero ninguna función de este archivo lo genera
   * todavía. No hay un `revertirMovimiento()` que lea los asientos de un
   * movimiento original y cree los inversos — eso llega con el módulo que
   * edita/elimina gastos de un periodo cerrado (ADR-001, modelo-dominio.md
   * §3), fuera del alcance actual del walking skeleton. Hoy este campo solo
   * sirve si un caller arma la reversión a mano y pasa el id aquí.
   */
  movimientoRevertidoId?: string;
}

/**
 * Variante componible: recibe una transacción ya abierta (con
 * `app.tenant_id` ya fijado) en vez de abrir la suya. La usan otros
 * módulos que necesitan crear una cuenta como parte de una operación más
 * grande y atómica (p. ej. periodos crea su cuenta y su fila de periodo
 * juntas). `crearCuenta` es el atajo para cuando no hace falta eso.
 */
export async function crearCuentaTx(tx: Ejecutor, tenantId: string, tipo: TipoCuenta): Promise<{ id: string }> {
  const [cuenta] = await tx.insert(cuentas).values({ tenantId, tipo }).returning({ id: cuentas.id });
  if (!cuenta) throw new Error('No se pudo crear la cuenta');
  return cuenta;
}

export async function crearCuenta(tenantId: string, tipo: TipoCuenta): Promise<{ id: string }> {
  return conTenant(tenantId, (tx) => crearCuentaTx(tx, tenantId, tipo));
}

/**
 * Variante componible — ver el comentario de `crearCuentaTx`. La usan
 * módulos que necesitan registrar un movimiento como parte de una
 * operación más grande (p. ej. ingresos valida el periodo y registra su
 * movimiento en la misma transacción).
 *
 * La validación de "las partidas suman cero" ocurre aquí en JS Y en un
 * trigger de la base de datos (drizzle/0002_ledger_triggers_integridad.sql).
 * No es redundancia inútil: esta la ve el llamador con un mensaje claro
 * antes de tocar la base; la de la base de datos es la que de verdad
 * importa, porque protege contra cualquier otro camino de escritura que
 * este archivo no haya previsto (ADR-001).
 */
export async function registrarMovimientoTx(tx: Ejecutor, entrada: RegistrarMovimientoEntrada): Promise<{ movimientoId: string }> {
  validarPartidasBalanceadas(entrada.partidas);

  const [movimiento] = await tx
    .insert(movimientos)
    .values({
      tenantId: entrada.tenantId,
      tipo: entrada.tipo,
      moneda: entrada.moneda,
      fechaEfectiva: entrada.fechaEfectiva,
      nota: entrada.nota,
      movimientoRevertidoId: entrada.movimientoRevertidoId,
    })
    .returning({ id: movimientos.id });
  if (!movimiento) throw new Error('No se pudo crear el movimiento');

  await tx.insert(asientos).values(
    entrada.partidas.map((partida) => ({
      tenantId: entrada.tenantId,
      movimientoId: movimiento.id,
      cuentaId: partida.cuentaId,
      montoValorMinimo: partida.montoValorMinimo,
      moneda: entrada.moneda,
    }))
  );

  return { movimientoId: movimiento.id };
}

export async function registrarMovimiento(entrada: RegistrarMovimientoEntrada): Promise<{ movimientoId: string }> {
  return conTenant(entrada.tenantId, (tx) => registrarMovimientoTx(tx, entrada));
}

/**
 * Genera el `movimientoRevertidoId` que quedó pendiente desde que se
 * definió esta tabla (ver comentario en db/schema/ledger.ts): un
 * movimiento `tipo: 'reversion'` con las mismas partidas que el
 * original pero invertidas.
 *
 * `cuentaDestino` casi nunca es la cuenta del movimiento original — es
 * la cuenta del periodo ACTIVO actual. Un movimiento de un periodo ya
 * cerrado no puede volver a tocar el saldo de ESE periodo (invariantes
 * 5 y 15, modelo-dominio.md: un periodo cerrado no cambia de saldo
 * nunca, y su resumen es inmutable); la corrección completa —reversión
 * y, si aplica, el asiento nuevo— se registra en el periodo activo de
 * hoy, tal como exige la tabla de casos límite de modelo-dominio.md §3.
 * Cuando el gasto original SÍ sigue en el periodo activo, `cuentaDestino`
 * resulta ser la misma cuenta de siempre — no es un caso especial, es
 * el mismo cálculo con el mismo resultado.
 *
 * La partida con `cuentaId: null` (contraparte externa) se invierte tal
 * cual, sin redirigir — no representa ningún periodo, no hay nada que
 * reapuntar.
 */
export async function revertirMovimientoTx(
  tx: Ejecutor,
  tenantId: string,
  movimientoIdOriginal: string,
  cuentaDestino: string,
  fechaEfectiva: string,
  nota?: string
): Promise<{ movimientoId: string }> {
  const [movimientoOriginal] = await tx
    .select({ moneda: movimientos.moneda })
    .from(movimientos)
    .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.id, movimientoIdOriginal)))
    .limit(1);
  if (!movimientoOriginal) throw new Error('No se encontró el movimiento a revertir');

  const asientosOriginales = await tx
    .select({ cuentaId: asientos.cuentaId, montoValorMinimo: asientos.montoValorMinimo })
    .from(asientos)
    .where(and(eq(asientos.tenantId, tenantId), eq(asientos.movimientoId, movimientoIdOriginal)));

  const partidasInvertidas: Partida[] = asientosOriginales.map((asiento) => ({
    cuentaId: asiento.cuentaId === null ? null : cuentaDestino,
    montoValorMinimo: -asiento.montoValorMinimo,
  }));

  return registrarMovimientoTx(tx, {
    tenantId,
    tipo: 'reversion',
    moneda: movimientoOriginal.moneda,
    fechaEfectiva,
    nota,
    movimientoRevertidoId: movimientoIdOriginal,
    partidas: partidasInvertidas,
  });
}

export async function obtenerSaldoCuenta(tenantId: string, cuentaId: string): Promise<bigint> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ saldo: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text` })
      .from(asientos)
      .where(eq(asientos.cuentaId, cuentaId));

    return BigInt(fila?.saldo ?? '0');
  });
}

/**
 * A diferencia de `obtenerSaldoCuenta` (el saldo total), esto es un
 * corte: la suma de los asientos cuyo movimiento tiene una
 * `fechaEfectiva` exacta, opcionalmente restringido a ciertos `tipo`s
 * (`TIPOS_MOVIMIENTO`, un valor cerrado que sí vive en el schema del
 * ledger — pedirlo aquí no es que este módulo "sepa qué es un gasto",
 * el llamador decide cuáles tipos le importan).
 *
 * El filtro por tipo importa porque el neto simple de "todo lo de hoy"
 * puede esconder un gasto detrás de un ingreso más grande del mismo
 * día (el caso típico del día 1) — ver el comentario en
 * consultar-disponible.ts sobre por qué el motor de flujo de caja pide
 * el neto de `['gasto']`.
 *
 * **El "tipo efectivo" de una reversión es el tipo de lo que revierte,
 * nunca `'reversion'` en sí — bug real, encontrado por el usuario
 * editando un ingreso.** Antes, `tipos: ['gasto', 'reversion']`
 * contaba CUALQUIER reversión como gasto de hoy, sin importar qué
 * revertía. Editar/eliminar un *ingreso* (modulos/ingresos/
 * registrar-ingreso.ts) también genera un movimiento `'reversion'`
 * (mismo mecanismo que gastos) — y esa reversión se sumaba a
 * `gastadoHoy` como si fuera un gasto real, aunque fuera solo una
 * corrección de ingreso. Resuelto con un `LEFT JOIN` contra el
 * movimiento original (`movimientoRevertidoId`): el tipo que se
 * compara contra `tipos` es el del original si existe (una reversión
 * de un gasto sigue contando como gasto; una reversión de un ingreso
 * ya no), o el propio tipo del movimiento si no es una reversión.
 */
export async function obtenerNetoCuentaEnFecha(
  tenantId: string,
  cuentaId: string,
  fechaEfectiva: string,
  tipos?: TipoMovimiento[]
): Promise<bigint> {
  return conTenant(tenantId, async (tx) => {
    const tipoEfectivo = sql`coalesce(${movimientoRevertido.tipo}, ${movimientos.tipo})`;
    const condiciones = [eq(asientos.cuentaId, cuentaId), eq(movimientos.fechaEfectiva, fechaEfectiva)];
    if (tipos && tipos.length > 0) {
      condiciones.push(inArray(tipoEfectivo, tipos));
    }

    const [fila] = await tx
      .select({ neto: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text` })
      .from(asientos)
      .innerJoin(movimientos, eq(movimientos.id, asientos.movimientoId))
      .leftJoin(movimientoRevertido, eq(movimientoRevertido.id, movimientos.movimientoRevertidoId))
      .where(and(...condiciones));

    return BigInt(fila?.neto ?? '0');
  });
}

function validarPartidasBalanceadas(partidas: Partida[]): void {
  if (partidas.length < 2) {
    throw new Error('Un movimiento necesita al menos dos partidas (partida doble)');
  }
  const suma = partidas.reduce((acumulado, partida) => acumulado + partida.montoValorMinimo, 0n);
  if (suma !== 0n) {
    throw new Error(`Las partidas no suman cero (suman ${suma})`);
  }
}
