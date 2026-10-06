import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { asientos, cuentas, movimientos } from '../../db/schema/ledger.js';
import { metas } from '../../db/schema/metas.js';
import { periodos } from '../../db/schema/periodos.js';
import { crearCuentaTx, registrarMovimientoTx, revertirMovimientoEnSusCuentasTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivoTx } from '../periodos/crear-periodo.js';
import { cobrosHabilitados, obtenerPlanTenantTx } from '../planes/planes.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { ahoraEnMexico, fechaISO } from '../../shared/fechas.js';
import { esUuidValido } from '../../shared/validacion.js';

/** documento-maestro-v2.md §9.2: "Metas de ahorro: 1–2 (Free) / Ilimitadas (Pro)". */
const LIMITE_METAS_FREE = 2;

export interface Meta {
  id: string;
  cuentaId: string;
  nombre: string;
  montoObjetivoValorMinimo: bigint;
  moneda: string;
}

export interface MetaConProgreso extends Meta {
  montoAcumuladoValorMinimo: bigint;
  /** 0-100+. Puede pasar de 100 si se aportó más del objetivo — no se recorta, es información real. */
  porcentajeAvance: number;
}

/**
 * Crea una meta y su cuenta de ledger (tipo 'meta') en una sola
 * transacción — mismo patrón que `crearPeriodo`. `montoAcumulado`
 * nunca se guarda: se deriva del saldo real de la cuenta, igual que
 * `disponible` (ver `listarMetas`).
 */
export async function crearMeta(tenantId: string, nombre: string, monto: bigint, moneda: string): Promise<Meta> {
  if (monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto objetivo de una meta debe ser positivo');
  }
  if (nombre.trim().length === 0) {
    throw new ErrorDominio('VALIDACION', 'El nombre de la meta no puede estar vacío');
  }

  return conTenant(tenantId, async (tx) => {
    const plan = await obtenerPlanTenantTx(tx, tenantId);
    if (plan === 'free') {
      const [fila] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(metas)
        .where(and(eq(metas.tenantId, tenantId), isNull(metas.archivadaEn)));
      if ((fila?.total ?? 0) >= LIMITE_METAS_FREE) {
        const limite = `Alcanzaste el límite de ${LIMITE_METAS_FREE} metas del plan gratuito`;
        throw new ErrorDominio(
          'LIMITE_METAS_ALCANZADO',
          cobrosHabilitados() ? `${limite} — Korly Pro las tiene ilimitadas` : `${limite}. Las metas ilimitadas llegarán con Korly Pro: en Ajustes puedes pedir que te avisemos.`
        );
      }
    }

    const cuenta = await crearCuentaTx(tx, tenantId, 'meta');

    const [meta] = await tx
      .insert(metas)
      .values({ tenantId, cuentaId: cuenta.id, nombre, montoObjetivoValorMinimo: monto, moneda })
      .returning();
    if (!meta) throw new Error('No se pudo crear la meta');

    return {
      id: meta.id,
      cuentaId: meta.cuentaId,
      nombre: meta.nombre,
      montoObjetivoValorMinimo: meta.montoObjetivoValorMinimo,
      moneda: meta.moneda,
    };
  });
}

/**
 * `montoAcumulado`/`porcentajeAvance` se calculan en una sola consulta
 * agrupada (no N+1: una suma de asientos por cuenta, no una por meta) —
 * mismo principio de "nunca cacheado, siempre recalculado" que
 * `consultarDisponible`.
 */
export async function listarMetas(tenantId: string): Promise<MetaConProgreso[]> {
  return conTenant(tenantId, async (tx) => {
    const filas = await tx
      .select({
        id: metas.id,
        cuentaId: metas.cuentaId,
        nombre: metas.nombre,
        montoObjetivoValorMinimo: metas.montoObjetivoValorMinimo,
        moneda: metas.moneda,
        montoAcumuladoValorMinimo: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text`,
      })
      .from(metas)
      .leftJoin(asientos, eq(asientos.cuentaId, metas.cuentaId))
      .where(and(eq(metas.tenantId, tenantId), isNull(metas.archivadaEn)))
      .groupBy(metas.id)
      .orderBy(desc(metas.creadoEn));

    return filas.map((fila) => {
      const montoAcumuladoValorMinimo = BigInt(fila.montoAcumuladoValorMinimo);
      return {
        id: fila.id,
        cuentaId: fila.cuentaId,
        nombre: fila.nombre,
        montoObjetivoValorMinimo: fila.montoObjetivoValorMinimo,
        moneda: fila.moneda,
        montoAcumuladoValorMinimo,
        porcentajeAvance: Number((montoAcumuladoValorMinimo * 10000n) / fila.montoObjetivoValorMinimo) / 100,
      };
    });
  });
}

/**
 * Usado por aportar/retirar y por `decidirSobrante`. `tenantId` en el
 * `WHERE` es cinturón y tirantes, no la defensa real — la política RLS
 * de `metas` ya filtra por `app.tenant_id`, así que pedir la meta de
 * otro tenant por id devuelve `null` igual que un id inexistente
 * (mismo criterio que `obtenerPeriodoPorIdTx`).
 */
export async function obtenerMetaPorIdTx(tx: Ejecutor, tenantId: string, metaId: string): Promise<Meta | null> {
  if (!esUuidValido(metaId)) return null;

  const [fila] = await tx
    .select()
    .from(metas)
    .where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId), isNull(metas.archivadaEn)))
    .limit(1);
  if (!fila) return null;

  return { id: fila.id, cuentaId: fila.cuentaId, nombre: fila.nombre, montoObjetivoValorMinimo: fila.montoObjetivoValorMinimo, moneda: fila.moneda };
}

/**
 * Bloquea la fila de la meta (`FOR UPDATE`) y confirma que sigue viva. Se usa
 * en todo lo que escribe contra la meta (aportar, retirar, pagar, deshacer,
 * editar, eliminar) para que archivarla no compita con un movimiento que va
 * en camino: sin el bloqueo, un aporte que empezó antes de archivar podía
 * caer en una meta ya archivada.
 */
async function bloquearMetaTx(tx: Ejecutor, metaId: string): Promise<void> {
  const [fila] = await tx.select({ archivadaEn: metas.archivadaEn }).from(metas).where(eq(metas.id, metaId)).for('update');
  if (!fila || fila.archivadaEn !== null) {
    throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
  }
}

export interface EditarMetaEntrada {
  tenantId: string;
  metaId: string;
  nombre?: string;
  montoObjetivo?: bigint;
}

/**
 * Cambia el nombre y/o el objetivo de una meta. Son datos de configuración,
 * no del ledger: `montoAcumulado` y `porcentajeAvance` se derivan siempre del
 * saldo real de la cuenta, así que cambiar el objetivo solo recalcula el
 * avance sin tocar ningún movimiento. Nada más lee el objetivo, de modo que
 * no hay nada congelado que corregir.
 */
export async function editarMeta(entrada: EditarMetaEntrada): Promise<Meta> {
  if (entrada.nombre === undefined && entrada.montoObjetivo === undefined) {
    throw new ErrorDominio('VALIDACION', 'Indica al menos un campo para editar: nombre o montoObjetivo');
  }
  const nombre = entrada.nombre?.trim();
  if (nombre !== undefined && nombre.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El nombre de la meta no puede estar vacío');
  }
  if (entrada.montoObjetivo !== undefined && entrada.montoObjetivo <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto objetivo de una meta debe ser positivo');
  }

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    await bloquearMetaTx(tx, meta.id);

    const [fila] = await tx
      .update(metas)
      .set({
        ...(nombre !== undefined ? { nombre } : {}),
        ...(entrada.montoObjetivo !== undefined ? { montoObjetivoValorMinimo: entrada.montoObjetivo } : {}),
      })
      .where(and(eq(metas.tenantId, entrada.tenantId), eq(metas.id, meta.id)))
      .returning();
    if (!fila) throw new Error('No se pudo editar la meta');

    return { id: fila.id, cuentaId: fila.cuentaId, nombre: fila.nombre, montoObjetivoValorMinimo: fila.montoObjetivoValorMinimo, moneda: fila.moneda };
  });
}

/**
 * Elimina una meta según su historial:
 *
 * - **Sin ningún asiento nunca** (ni aportes ni retiros ni pagos): se borra de
 *   verdad (fila de `metas` + su `cuenta`) — no hay nada del ledger que
 *   preservar. Mismo criterio que `eliminarTarjeta`.
 * - **Con historial y saldo exactamente en cero:** se **archiva**
 *   (`archivada_en`). Sus movimientos son inmutables (ADR-001), pero la meta
 *   ya no guarda dinero, así que sale del listado, deja de contar para el
 *   límite del plan gratuito y se trata como inexistente.
 * - **Con saldo distinto de cero:** se rechaza (`META_CON_HISTORIAL`). No se
 *   puede esconder dinero: hay que dejarla en cero primero (pagar con ella o
 *   pasarlo a la quincena). Un saldo negativo (retiro que superó lo ahorrado)
 *   también se rechaza.
 */
export async function eliminarMeta(tenantId: string, metaId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, tenantId, metaId);
    if (!meta) {
      throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    }
    await bloquearMetaTx(tx, meta.id);

    const [fila] = await tx.select({ total: sql<number>`count(*)::int` }).from(asientos).where(eq(asientos.cuentaId, meta.cuentaId));
    if ((fila?.total ?? 0) === 0) {
      await tx.delete(metas).where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId)));
      await tx.delete(cuentas).where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.id, meta.cuentaId)));
      return;
    }

    if ((await saldoCuentaTx(tx, meta.cuentaId)) !== 0n) {
      throw new ErrorDominio(
        'META_CON_HISTORIAL',
        'Esta meta todavía tiene saldo. Déjala en cero (paga con ella o pásalo a tu quincena) y después podrás eliminarla.'
      );
    }

    await tx.update(metas).set({ archivadaEn: new Date() }).where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId)));
  });
}

/** Mismo criterio que `periodoActivoObligatorioTx` en registrar-gasto.ts/registrar-ingreso.ts. */
async function periodoActivoObligatorioTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date, mensaje: string) {
  const periodoActivo = await obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia);
  if (!periodoActivo) {
    throw new ErrorDominio('SIN_PERIODO_ACTIVO', mensaje);
  }
  return periodoActivo;
}

export interface AportarAMetaEntrada {
  tenantId: string;
  metaId: string;
  monto: bigint;
  moneda: string;
  fechaReferencia?: Date;
}

export interface AporteResultado {
  /** No existe una tabla `aportes` (ver README, "Metas de ahorro") — es el id del movimiento del ledger. */
  id: string;
  metaId: string;
  periodoOrigenId: string;
}

/**
 * Reduce el disponible del periodo activo — modelo-dominio.md §6: "el
 * aporte se trata como un gasto más para efectos del motor de flujo de
 * caja". Mismas partidas que un gasto (negativa contra el periodo),
 * solo que la contraparte es una cuenta real (la meta), no externa.
 *
 * **No se puede aportar más de lo que hay disponible** (`APORTE_EXCEDE_DISPONIBLE`).
 * A diferencia de un gasto — que ya ocurrió en la vida real y por eso se
 * registra aunque sobregire (modelo-dominio.md §5) — un aporte es una
 * transferencia voluntaria: dejaba la quincena en negativo moviendo a la meta
 * dinero que nunca existió. La fila del periodo se bloquea para que dos
 * aportes simultáneos no se pasen entre sí.
 */
export async function aportarAMeta(entrada: AportarAMetaEntrada): Promise<AporteResultado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un aporte debe ser positivo');
  }
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    await bloquearMetaTx(tx, meta.id);

    const periodo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia, 'No hay periodo activo del cual descontar el aporte');

    await tx.select({ id: periodos.id }).from(periodos).where(eq(periodos.id, periodo.id)).for('update');
    if (entrada.monto > (await saldoCuentaTx(tx, periodo.cuentaId))) {
      throw new ErrorDominio('APORTE_EXCEDE_DISPONIBLE', 'El aporte supera lo que tienes disponible en tu quincena');
    }

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'aporte_meta',
      moneda: entrada.moneda,
      fechaEfectiva: fechaISO(fechaReferencia),
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: meta.cuentaId, montoValorMinimo: entrada.monto },
      ],
    });

    return { id: movimientoId, metaId: meta.id, periodoOrigenId: periodo.id };
  });
}

export interface RetirarDeMetaEntrada {
  tenantId: string;
  metaId: string;
  monto: bigint;
  moneda: string;
  motivo: string;
  fechaReferencia?: Date;
}

export interface RetiroResultado {
  id: string;
  metaId: string;
  periodoDestinoId: string;
}

/**
 * Simétrico de `aportarAMeta`: aumenta el disponible del periodo activo,
 * tratado como un ingreso más — decisión propia, no documentada
 * explícitamente en modelo-dominio.md (que solo confirma el caso de
 * aportar). Mismo requisito de periodo activo que aportar, por la misma
 * razón: el dinero retirado tiene que aterrizar en una cuenta real que
 * exista, y la única cuenta "tuya" que hay hoy es la del periodo activo
 * (ver README, "Metas de ahorro", para la justificación completa).
 *
 * **No se puede retirar más de lo que tiene la meta** (`SALDO_META_INSUFICIENTE`).
 * Antes se permitía "por el criterio del sobregiro de gastos", pero eso era un
 * error de analogía: un gasto ya ocurrió en la vida real y por eso se registra
 * aunque sobregire; un retiro es una transferencia voluntaria, y dejaba la meta
 * en negativo creando en la quincena dinero que nunca existió. Hay además un
 * trigger en la base de datos (`asientos_meta_no_negativa`, migración 0025)
 * como red de seguridad.
 */
export async function retirarDeMeta(entrada: RetirarDeMetaEntrada): Promise<RetiroResultado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un retiro debe ser positivo');
  }
  if (entrada.motivo.trim().length === 0) {
    throw new ErrorDominio('VALIDACION', 'El motivo del retiro es obligatorio');
  }
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    await bloquearMetaTx(tx, meta.id);

    const periodo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia, 'No hay periodo activo en el cual depositar el retiro');

    if (entrada.monto > (await saldoCuentaTx(tx, meta.cuentaId))) {
      throw new ErrorDominio('SALDO_META_INSUFICIENTE', 'La meta no tiene saldo suficiente para este retiro');
    }

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'retiro_meta',
      moneda: entrada.moneda,
      fechaEfectiva: fechaISO(fechaReferencia),
      nota: entrada.motivo,
      partidas: [
        { cuentaId: meta.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: periodo.cuentaId, montoValorMinimo: entrada.monto },
      ],
    });

    return { id: movimientoId, metaId: meta.id, periodoDestinoId: periodo.id };
  });
}

async function saldoCuentaTx(tx: Ejecutor, cuentaId: string): Promise<bigint> {
  const [fila] = await tx
    .select({ saldo: sql<string>`coalesce(sum(${asientos.montoValorMinimo}), 0)::text` })
    .from(asientos)
    .where(eq(asientos.cuentaId, cuentaId));
  return BigInt(fila?.saldo ?? '0');
}

export interface PagarConMetaEntrada {
  tenantId: string;
  metaId: string;
  monto: bigint;
  moneda: string;
  motivo: string;
  fechaReferencia?: Date;
}

export interface PagoMetaResultado {
  /** Id del movimiento del ledger (no existe una tabla `pagos_meta`, igual que aportes/retiros). */
  id: string;
  metaId: string;
}

/**
 * Paga algo directamente con el dinero de una meta (meta → externo), sin
 * pasar por la quincena. A diferencia de `retirarDeMeta` (que mueve el
 * dinero al disponible del periodo como si fuera un ingreso, y luego el
 * gasto lo vuelve a restar), aquí el movimiento nunca toca la cuenta de
 * ningún periodo: el disponible, la cifra diaria, el resumen del periodo y
 * el desglose semanal lo ignoran por construcción, porque todos leen solo
 * los asientos de la cuenta del periodo. Por eso tampoco exige un periodo
 * activo.
 *
 * Sí valida que la meta alcance: es dinero apartado, no un presupuesto
 * flexible. La fila de la meta se bloquea (`FOR UPDATE`) para que dos pagos
 * simultáneos no la sobregiren.
 */
export async function pagarConMeta(entrada: PagarConMetaEntrada): Promise<PagoMetaResultado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un pago debe ser positivo');
  }
  const motivo = entrada.motivo.trim();
  if (motivo.length === 0) {
    throw new ErrorDominio('VALIDACION', 'El motivo del pago es obligatorio');
  }
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');

    await bloquearMetaTx(tx, meta.id);

    if (entrada.monto > (await saldoCuentaTx(tx, meta.cuentaId))) {
      throw new ErrorDominio('SALDO_META_INSUFICIENTE', 'La meta no tiene saldo suficiente para este pago');
    }

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'pago_meta',
      moneda: entrada.moneda,
      fechaEfectiva: fechaISO(fechaReferencia),
      nota: motivo,
      partidas: [
        { cuentaId: meta.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: null, montoValorMinimo: entrada.monto },
      ],
    });

    return { id: movimientoId, metaId: meta.id };
  });
}

/**
 * Corrige un pago hecho con la meta: el dinero vuelve a la meta (no a la
 * quincena — el pago nunca salió de ahí). Siempre por reversión, nunca por
 * borrado (ADR-001).
 */
export async function deshacerPagoMeta(tenantId: string, metaId: string, movimientoId: string, fechaReferencia: Date = ahoraEnMexico()): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, tenantId, metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    if (!esUuidValido(movimientoId)) throw new ErrorDominio('PAGO_META_NO_ENCONTRADO', 'El pago especificado no existe');

    const [pago] = await tx
      .select({ id: movimientos.id })
      .from(movimientos)
      .innerJoin(asientos, eq(asientos.movimientoId, movimientos.id))
      .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.id, movimientoId), eq(movimientos.tipo, 'pago_meta'), eq(asientos.cuentaId, meta.cuentaId)))
      .limit(1);
    if (!pago) throw new ErrorDominio('PAGO_META_NO_ENCONTRADO', 'El pago especificado no existe');

    await bloquearMetaTx(tx, meta.id);

    const [reversion] = await tx
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.movimientoRevertidoId, pago.id)))
      .limit(1);
    if (reversion) throw new ErrorDominio('PAGO_META_YA_REVERTIDO', 'Este pago ya fue deshecho antes');

    await revertirMovimientoEnSusCuentasTx(tx, tenantId, pago.id, fechaISO(fechaReferencia), 'Reversión de pago con meta');
  });
}

export interface DepositarEnMetaEntrada {
  tenantId: string;
  metaId: string;
  monto: bigint;
  moneda: string;
  /** Opcional: de dónde venía ("ahorro que ya tenía", "regalo"). */
  motivo?: string;
  fechaReferencia?: Date;
}

/**
 * Mete a una meta dinero que YA existía fuera de la app (externo → meta): el
 * ahorro que alguien tenía antes de empezar a usar Korly, un regalo, un bono que
 * decide ahorrar completo. Es el espejo de `pagarConMeta`: el movimiento nunca
 * toca la cuenta de ningún periodo, así que no cambia el disponible, la cifra
 * diaria ni el resumen del periodo — a diferencia de `aportarAMeta`, que mueve
 * dinero de la quincena y por eso queda limitado a lo disponible. Tampoco exige
 * periodo activo.
 */
export async function depositarEnMeta(entrada: DepositarEnMetaEntrada): Promise<PagoMetaResultado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un aporte externo debe ser positivo');
  }
  const motivo = entrada.motivo?.trim();
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    await bloquearMetaTx(tx, meta.id);

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'deposito_meta',
      moneda: entrada.moneda,
      fechaEfectiva: fechaISO(fechaReferencia),
      nota: motivo && motivo.length > 0 ? motivo : undefined,
      partidas: [
        { cuentaId: meta.cuentaId, montoValorMinimo: entrada.monto },
        { cuentaId: null, montoValorMinimo: -entrada.monto },
      ],
    });

    return { id: movimientoId, metaId: meta.id };
  });
}

/**
 * Corrige un aporte externo: el dinero sale de la meta de vuelta a "fuera". Solo si
 * la meta todavía lo tiene — si ya se pagó o se pasó a la quincena, deshacerlo
 * dejaría la meta en negativo (`SALDO_META_INSUFICIENTE`). Siempre por reversión.
 */
export async function deshacerDepositoMeta(tenantId: string, metaId: string, movimientoId: string, fechaReferencia: Date = ahoraEnMexico()): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, tenantId, metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    if (!esUuidValido(movimientoId)) throw new ErrorDominio('DEPOSITO_META_NO_ENCONTRADO', 'El aporte especificado no existe');

    const [deposito] = await tx
      .select({ id: movimientos.id, monto: asientos.montoValorMinimo })
      .from(movimientos)
      .innerJoin(asientos, eq(asientos.movimientoId, movimientos.id))
      .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.id, movimientoId), eq(movimientos.tipo, 'deposito_meta'), eq(asientos.cuentaId, meta.cuentaId)))
      .limit(1);
    if (!deposito) throw new ErrorDominio('DEPOSITO_META_NO_ENCONTRADO', 'El aporte especificado no existe');

    await bloquearMetaTx(tx, meta.id);

    const [reversion] = await tx
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.movimientoRevertidoId, deposito.id)))
      .limit(1);
    if (reversion) throw new ErrorDominio('DEPOSITO_META_YA_REVERTIDO', 'Este aporte ya fue deshecho antes');

    if (deposito.monto > (await saldoCuentaTx(tx, meta.cuentaId))) {
      throw new ErrorDominio('SALDO_META_INSUFICIENTE', 'La meta ya no tiene ese dinero (se pagó o se pasó a la quincena), así que no se puede deshacer');
    }

    await revertirMovimientoEnSusCuentasTx(tx, tenantId, deposito.id, fechaISO(fechaReferencia), 'Reversión de aporte externo a meta');
  });
}

export type TipoMovimientoDeMeta = 'aporte' | 'retiro' | 'pago' | 'deposito';

export interface MovimientoDeMeta {
  id: string;
  tipo: TipoMovimientoDeMeta;
  /** Con signo desde el punto de vista de la meta: positivo entra a la meta, negativo sale. */
  montoValorMinimo: bigint;
  moneda: string;
  fechaEfectiva: string;
  nota: string | null;
  /** true si ya se deshizo (solo los pagos se pueden deshacer desde aquí). */
  revertido: boolean;
}

const LIMITE_MOVIMIENTOS_DE_META = 50;

const TIPO_DE_MOVIMIENTO_DE_META: Readonly<Record<string, TipoMovimientoDeMeta>> = {
  aporte_meta: 'aporte',
  retiro_meta: 'retiro',
  pago_meta: 'pago',
  deposito_meta: 'deposito',
};

/**
 * Historial de una meta: aportes (incluido el sobrante que se decidió
 * ahorrar), retiros hacia la quincena y pagos hechos con ella, el más
 * reciente primero. Las reversiones no se listan como filas propias: su
 * original aparece marcado `revertido`.
 */
export async function listarMovimientosDeMeta(tenantId: string, metaId: string): Promise<MovimientoDeMeta[]> {
  return conTenant(tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, tenantId, metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');

    const filas = await tx
      .select({
        id: movimientos.id,
        tipo: movimientos.tipo,
        moneda: movimientos.moneda,
        fechaEfectiva: movimientos.fechaEfectiva,
        nota: movimientos.nota,
        monto: asientos.montoValorMinimo,
      })
      .from(asientos)
      .innerJoin(movimientos, eq(movimientos.id, asientos.movimientoId))
      .where(and(eq(asientos.tenantId, tenantId), eq(asientos.cuentaId, meta.cuentaId), ne(movimientos.tipo, 'reversion')))
      .orderBy(desc(movimientos.fechaRegistro))
      .limit(LIMITE_MOVIMIENTOS_DE_META);

    const ids = filas.map((fila) => fila.id);
    const revertidos =
      ids.length === 0
        ? []
        : await tx
            .select({ movimientoRevertidoId: movimientos.movimientoRevertidoId })
            .from(movimientos)
            .where(and(eq(movimientos.tenantId, tenantId), inArray(movimientos.movimientoRevertidoId, ids)));
    const idsRevertidos = new Set(revertidos.map((fila) => fila.movimientoRevertidoId));

    return filas.flatMap((fila) => {
      const tipo = TIPO_DE_MOVIMIENTO_DE_META[fila.tipo];
      if (!tipo) return [];
      return [{ id: fila.id, tipo, montoValorMinimo: fila.monto, moneda: fila.moneda, fechaEfectiva: fila.fechaEfectiva, nota: fila.nota, revertido: idsRevertidos.has(fila.id) }];
    });
  });
}
