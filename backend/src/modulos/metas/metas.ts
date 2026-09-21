import { and, desc, eq, sql } from 'drizzle-orm';
import { asientos, cuentas } from '../../db/schema/ledger.js';
import { metas } from '../../db/schema/metas.js';
import { crearCuentaTx, registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivoTx } from '../periodos/crear-periodo.js';
import { obtenerPlanTenantTx } from '../planes/planes.js';
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
      const [fila] = await tx.select({ total: sql<number>`count(*)::int` }).from(metas).where(eq(metas.tenantId, tenantId));
      if ((fila?.total ?? 0) >= LIMITE_METAS_FREE) {
        throw new ErrorDominio('LIMITE_METAS_ALCANZADO', `Alcanzaste el límite de ${LIMITE_METAS_FREE} metas del plan gratuito — Korly Pro las tiene ilimitadas`);
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
      .where(eq(metas.tenantId, tenantId))
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
    .where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId)))
    .limit(1);
  if (!fila) return null;

  return { id: fila.id, cuentaId: fila.cuentaId, nombre: fila.nombre, montoObjetivoValorMinimo: fila.montoObjetivoValorMinimo, moneda: fila.moneda };
}

/**
 * Solo si la cuenta de la meta nunca recibió ningún asiento — no solo
 * "saldo en cero", que un aporte seguido de un retiro idéntico también
 * deja en cero pero sí con historial real detrás (aportarAMeta,
 * retirarDeMeta, y decidirSobrante cuando el usuario elige "ahorrar",
 * ver cierre/decidir-sobrante.ts, todos escriben contra esta misma
 * cuenta). Sin aportes ni retiros de por medio, no hay nada del ledger
 * que preservar, así que sí se borra de verdad (fila de `metas` + su
 * `cuenta`) — mismo criterio que `eliminarTarjeta`.
 */
export async function eliminarMeta(tenantId: string, metaId: string): Promise<void> {
  return conTenant(tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, tenantId, metaId);
    if (!meta) {
      throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');
    }

    const [fila] = await tx.select({ total: sql<number>`count(*)::int` }).from(asientos).where(eq(asientos.cuentaId, meta.cuentaId));
    if ((fila?.total ?? 0) > 0) {
      throw new ErrorDominio('META_CON_HISTORIAL', 'No se puede eliminar una meta que ya tiene aportes o retiros registrados');
    }

    await tx.delete(metas).where(and(eq(metas.tenantId, tenantId), eq(metas.id, metaId)));
    await tx.delete(cuentas).where(and(eq(cuentas.tenantId, tenantId), eq(cuentas.id, meta.cuentaId)));
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
 */
export async function aportarAMeta(entrada: AportarAMetaEntrada): Promise<AporteResultado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un aporte debe ser positivo');
  }
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    const meta = await obtenerMetaPorIdTx(tx, entrada.tenantId, entrada.metaId);
    if (!meta) throw new ErrorDominio('META_NO_ENCONTRADA', 'La meta especificada no existe');

    const periodo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia, 'No hay periodo activo del cual descontar el aporte');

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
 * Sin validar que `monto <= montoAcumulado`: mismo criterio que el
 * sobregiro permitido en gastos (modelo-dominio.md §5) — no hay
 * guardarraíles artificiales sobre saldos, ninguna otra cuenta del
 * sistema los tiene tampoco.
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

    const periodo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia, 'No hay periodo activo en el cual depositar el retiro');

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
