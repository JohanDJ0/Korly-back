import { eq, sql } from 'drizzle-orm';
import { asientos, cuentas, movimientos, type TipoCuenta, type TipoMovimiento } from '../../db/schema/ledger.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';

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

export async function obtenerSaldoCuenta(tenantId: string, cuentaId: string): Promise<bigint> {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({ saldo: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text` })
      .from(asientos)
      .where(eq(asientos.cuentaId, cuentaId));

    return BigInt(fila?.saldo ?? '0');
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
