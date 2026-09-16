import { and, eq, sql } from 'drizzle-orm';
import { cargosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { asientos, cuentas } from '../../db/schema/ledger.js';
import { tarjetas } from '../../db/schema/tarjetas.js';
import { crearCuentaTx } from '../ledger/registrar-movimiento.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { esUuidValido } from '../../shared/validacion.js';

export interface Tarjeta {
  id: string;
  cuentaId: string;
  nombre: string;
  limiteCreditoValorMinimo: bigint;
  moneda: string;
  diaCorte: number;
  diasParaPago: number;
}

export interface TarjetaConSaldo extends Tarjeta {
  /** Negativo si hay deuda (convención del ledger: un cargo resta, un pago suma) — nunca se muestra tal cual al usuario, ver rutas.ts. */
  saldoValorMinimo: bigint;
  creditoDisponibleValorMinimo: bigint;
}

const COLUMNAS_TARJETA = {
  id: tarjetas.id,
  cuentaId: tarjetas.cuentaId,
  nombre: tarjetas.nombre,
  limiteCreditoValorMinimo: tarjetas.limiteCreditoValorMinimo,
  moneda: tarjetas.moneda,
  diaCorte: tarjetas.diaCorte,
  diasParaPago: tarjetas.diasParaPago,
} as const;

export async function crearTarjeta(
  tenantId: string,
  nombre: string,
  limiteCreditoValorMinimo: bigint,
  moneda: string,
  diaCorte: number,
  diasParaPago: number
): Promise<Tarjeta> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length === 0) {
    throw new ErrorDominio('VALIDACION', "El campo 'nombre' no puede estar vacío");
  }
  if (limiteCreditoValorMinimo <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El límite de crédito debe ser positivo');
  }
  if (!Number.isInteger(diaCorte) || diaCorte < 1 || diaCorte > 31) {
    throw new ErrorDominio('VALIDACION', "El campo 'diaCorte' debe ser un entero entre 1 y 31");
  }
  if (!Number.isInteger(diasParaPago) || diasParaPago <= 0) {
    throw new ErrorDominio('VALIDACION', "El campo 'diasParaPago' debe ser un entero positivo");
  }

  return conTenant(tenantId, async (tx) => {
    const cuenta = await crearCuentaTx(tx, tenantId, 'tarjeta');
    const [tarjeta] = await tx
      .insert(tarjetas)
      .values({ tenantId, cuentaId: cuenta.id, nombre: nombreLimpio, limiteCreditoValorMinimo, moneda, diaCorte, diasParaPago })
      .returning(COLUMNAS_TARJETA);
    if (!tarjeta) throw new Error('No se pudo crear la tarjeta');
    return tarjeta;
  });
}

async function saldoCuentaTx(tx: Ejecutor, cuentaId: string): Promise<bigint> {
  const [fila] = await tx
    .select({ saldo: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text` })
    .from(asientos)
    .where(eq(asientos.cuentaId, cuentaId));
  return BigInt(fila?.saldo ?? '0');
}

/** Más reciente primero — sin distinción activa/pausada (a diferencia de recurrentes, no hay concepto de "pausar" una tarjeta todavía). */
export async function listarTarjetas(tenantId: string): Promise<TarjetaConSaldo[]> {
  return conTenant(tenantId, async (tx) => {
    const filas = await tx.select(COLUMNAS_TARJETA).from(tarjetas).where(eq(tarjetas.tenantId, tenantId));

    const conSaldo: TarjetaConSaldo[] = [];
    for (const tarjeta of filas) {
      const saldoValorMinimo = await saldoCuentaTx(tx, tarjeta.cuentaId);
      conSaldo.push({ ...tarjeta, saldoValorMinimo, creditoDisponibleValorMinimo: tarjeta.limiteCreditoValorMinimo + saldoValorMinimo });
    }
    return conSaldo;
  });
}

/**
 * Mismo criterio BOLA que el resto (`obtenerPeriodoPorIdTx`,
 * `obtenerMetaPorIdTx`): `tenantId` en el `WHERE` es cinturón y
 * tirantes, la política RLS de `tarjetas` es la defensa real. El guard
 * de `esUuidValido` es el mismo hallazgo del pase de QA/UX aplicado
 * aquí desde el principio, no un descuido corregido después.
 */
export async function obtenerTarjetaPorIdTx(tx: Ejecutor, tenantId: string, tarjetaId: string): Promise<Tarjeta | null> {
  if (!esUuidValido(tarjetaId)) return null;

  const [fila] = await tx
    .select(COLUMNAS_TARJETA)
    .from(tarjetas)
    .where(and(eq(tarjetas.tenantId, tenantId), eq(tarjetas.id, tarjetaId)))
    .limit(1);
  return fila ?? null;
}

export async function obtenerSaldoTarjetaTx(tx: Ejecutor, cuentaId: string): Promise<bigint> {
  return saldoCuentaTx(tx, cuentaId);
}

/**
 * Solo permitido si la tarjeta nunca tuvo ningún cargo — el mismo
 * momento en que "me equivoqué al crearla" es seguro de deshacer del
 * todo. Un cargo ya registrado generó un movimiento `'cargo_tarjeta'`
 * real (inmutable, ADR-001); borrar la tarjeta en ese caso dejaría ese
 * movimiento apuntando a una cuenta sin dueño. Sin cargos, en cambio,
 * la cuenta de la tarjeta nunca recibió ni un solo asiento — no hay
 * nada del ledger que preservar, así que sí se borra de verdad (fila
 * de `tarjetas` + su `cuenta`), a diferencia de gastos/ingresos, que
 * nunca se borran de verdad por la misma inmutabilidad.
 */
export async function eliminarTarjeta(tenantId: string, tarjetaId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const tarjeta = await obtenerTarjetaPorIdTx(tx, tenantId, tarjetaId);
    if (!tarjeta) {
      throw new ErrorDominio('TARJETA_NO_ENCONTRADA', 'La tarjeta especificada no existe');
    }

    const [fila] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(cargosTarjeta)
      .where(and(eq(cargosTarjeta.tenantId, tenantId), eq(cargosTarjeta.tarjetaId, tarjetaId)));
    if ((fila?.total ?? 0) > 0) {
      throw new ErrorDominio('TARJETA_CON_HISTORIAL', 'No se puede eliminar una tarjeta que ya tiene cargos registrados');
    }

    await tx.delete(tarjetas).where(and(eq(tarjetas.tenantId, tenantId), eq(tarjetas.id, tarjetaId)));
    await tx.delete(cuentas).where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.id, tarjeta.cuentaId)));
  });
}
