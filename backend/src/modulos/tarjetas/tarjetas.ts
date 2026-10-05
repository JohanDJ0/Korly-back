import { and, eq, isNull, sql } from 'drizzle-orm';
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

/** Sin distinción activa/pausada (a diferencia de recurrentes, no hay concepto de "pausar" una tarjeta todavía). Las archivadas no se listan. */
export async function listarTarjetas(tenantId: string): Promise<TarjetaConSaldo[]> {
  return conTenant(tenantId, async (tx) => {
    const filas = await tx.select(COLUMNAS_TARJETA).from(tarjetas).where(and(eq(tarjetas.tenantId, tenantId), isNull(tarjetas.archivadaEn)));

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
    .where(and(eq(tarjetas.tenantId, tenantId), eq(tarjetas.id, tarjetaId), isNull(tarjetas.archivadaEn)))
    .limit(1);
  return fila ?? null;
}

export async function obtenerSaldoTarjetaTx(tx: Ejecutor, cuentaId: string): Promise<bigint> {
  return saldoCuentaTx(tx, cuentaId);
}

/**
 * Elimina una tarjeta según su historial:
 *
 * - **Sin cargos nunca:** se borra de verdad (fila de `tarjetas` + su
 *   `cuenta`) — la cuenta jamás recibió un asiento, no hay nada del ledger
 *   que preservar.
 * - **Con cargos, todos ya corregidos y deuda en cero:** se **archiva**
 *   (`archivada_en`) en vez de borrarla. Un cargo, aunque corregido, dejó
 *   movimientos inmutables (trigger de Postgres, ADR-001) y su fila en
 *   `cargos_tarjeta` sigue apuntando a la tarjeta, así que no se puede
 *   borrar; pero ya no debe estorbarle al usuario. Archivada, desaparece
 *   del listado y se trata como inexistente (no admite cargos nuevos).
 * - **Con algún cargo vigente (sin corregir):** se rechaza. Hay deuda real;
 *   el usuario debe corregir esos cargos primero (Ver compras → Corregir).
 *
 * `eliminarCargoTarjeta` (registrar-cargo.ts) deja el cargo con su
 * reversión; las mensualidades aún no cobradas se borran y las ya cobradas
 * se revierten, de modo que "todos corregidos" implica saldo cero — igual
 * se comprueba el saldo como cinturón y tirantes.
 */
export async function eliminarTarjeta(tenantId: string, tarjetaId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const tarjeta = await obtenerTarjetaPorIdTx(tx, tenantId, tarjetaId);
    if (!tarjeta) {
      throw new ErrorDominio('TARJETA_NO_ENCONTRADA', 'La tarjeta especificada no existe');
    }

    const [fila] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        vigentes: sql<number>`count(*) filter (where not exists (select 1 from movimientos r where r.movimiento_revertido_id = ${cargosTarjeta.movimientoId}))::int`,
      })
      .from(cargosTarjeta)
      .where(and(eq(cargosTarjeta.tenantId, tenantId), eq(cargosTarjeta.tarjetaId, tarjetaId)));
    const total = fila?.total ?? 0;
    const vigentes = fila?.vigentes ?? 0;

    if (total === 0) {
      await tx.delete(tarjetas).where(and(eq(tarjetas.tenantId, tenantId), eq(tarjetas.id, tarjetaId)));
      await tx.delete(cuentas).where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.id, tarjeta.cuentaId)));
      return;
    }

    if (vigentes > 0 || (await saldoCuentaTx(tx, tarjeta.cuentaId)) !== 0n) {
      throw new ErrorDominio(
        'TARJETA_CON_HISTORIAL',
        'Esta tarjeta tiene compras vigentes. Corrígelas primero en "Ver compras" y después podrás eliminarla.'
      );
    }

    await tx.update(tarjetas).set({ archivadaEn: new Date() }).where(and(eq(tarjetas.tenantId, tenantId), eq(tarjetas.id, tarjetaId)));
  });
}
