import { and, desc, eq, isNotNull, lt, or } from 'drizzle-orm';
import { gastos } from '../../db/schema/gastos.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { registrarMovimientoTx, revertirMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivoTx, obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { fechaISO } from '../../shared/fechas.js';

export interface RegistrarGastoEntrada {
  tenantId: string;
  periodoId: string;
  /** Siempre positivo — el signo hacia la cuenta del periodo lo aplica esta función, no el caller. */
  monto: bigint;
  moneda: string;
  /** 'YYYY-MM-DD'. Por defecto, la fecha actual la resuelve el caller (no hay capa HTTP todavía que la infiera). */
  fechaEfectiva: string;
  nota?: string;
  /** Para el cierre perezoso del periodo destino — ver el mismo campo en registrar-ingreso.ts. */
  fechaReferencia?: Date;
}

export interface GastoRegistrado {
  id: string;
  movimientoId: string;
}

/**
 * Registra un gasto contra un periodo, en una sola transacción — mismo
 * patrón que registrarIngreso (ver modulos/ingresos/registrar-ingreso.ts),
 * con el signo de la partida invertido: un gasto reduce el saldo de la
 * cuenta del periodo en vez de aumentarlo.
 *
 * El periodo destino debe estar Activo (openapi.yaml, invariante 10 de
 * modelo-dominio.md).
 */
export async function registrarGasto(entrada: RegistrarGastoEntrada): Promise<GastoRegistrado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un gasto debe ser positivo');
  }

  return conTenant(entrada.tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, entrada.tenantId, entrada.periodoId, entrada.fechaReferencia ?? new Date());
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }
    if (periodo.estado !== 'activo') {
      throw new ErrorDominio('PERIODO_NO_ACTIVO', 'El periodo especificado no está en estado Activo');
    }

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'gasto',
      moneda: entrada.moneda,
      fechaEfectiva: entrada.fechaEfectiva,
      nota: entrada.nota,
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: null, montoValorMinimo: entrada.monto },
      ],
    });

    const [gasto] = await tx
      .insert(gastos)
      .values({ tenantId: entrada.tenantId, periodoId: entrada.periodoId, movimientoId })
      .returning({ id: gastos.id });
    if (!gasto) throw new Error('No se pudo registrar el gasto');

    return { id: gasto.id, movimientoId };
  });
}

/**
 * Carga lo necesario para corregir un gasto y valida que sea corregible:
 * que exista (para este tenant) y que no se le haya aplicado ya una
 * reversión antes (editar/eliminar dos veces el mismo gasto duplicaría
 * el ajuste). "Ya revertido" se comprueba buscando un movimiento cuyo
 * `movimientoRevertidoId` apunte al de este gasto — no hace falta una
 * columna de estado en `gastos`, el propio ledger ya lo sabe.
 *
 * El monto original se lee del asiento con `cuentaId` no nulo (la pata
 * que sí representa una cuenta real, ver comentario de `cuentaId` en
 * db/schema/ledger.ts) — para un gasto ese asiento es negativo, de ahí
 * el signo invertido al devolverlo.
 */
async function cargarGastoParaCorreccionTx(
  tx: Ejecutor,
  tenantId: string,
  gastoId: string
): Promise<{ movimientoId: string; periodoId: string }> {
  const [gasto] = await tx
    .select({ movimientoId: gastos.movimientoId, periodoId: gastos.periodoId })
    .from(gastos)
    .where(and(eq(gastos.tenantId, tenantId), eq(gastos.id, gastoId)))
    .limit(1);
  if (!gasto) {
    throw new ErrorDominio('GASTO_NO_ENCONTRADO', 'El gasto especificado no existe');
  }

  const [reversionExistente] = await tx
    .select({ id: movimientos.id })
    .from(movimientos)
    .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.movimientoRevertidoId, gasto.movimientoId)))
    .limit(1);
  if (reversionExistente) {
    throw new ErrorDominio('GASTO_YA_REVERTIDO', 'Este gasto ya fue editado o eliminado antes');
  }

  return gasto;
}

/**
 * Resuelve el periodo activo actual (mismo cierre perezoso que el resto
 * del sistema) o lanza si no hay ninguno — no hay dónde aterrizar la
 * corrección. No se auto-crea un periodo aquí: crear un periodo es una
 * decisión del usuario (`POST /periodos`), no un efecto secundario de
 * corregir un gasto viejo.
 */
async function periodoActivoObligatorioTx(tx: Ejecutor, tenantId: string, fechaReferencia: Date) {
  const periodoActivo = await obtenerPeriodoActivoTx(tx, tenantId, fechaReferencia);
  if (!periodoActivo) {
    throw new ErrorDominio('SIN_PERIODO_ACTIVO', 'No hay periodo activo para aplicar el ajuste');
  }
  return periodoActivo;
}

export interface EliminarGastoEntrada {
  tenantId: string;
  gastoId: string;
  fechaReferencia?: Date;
}

/**
 * "Elimina" un gasto sin tocar su fila jamás (`gastos_inmutables`,
 * migración 0007, lo impide de cualquier forma): genera la reversión de
 * su movimiento contra el periodo activo actual. El gasto original
 * queda tal cual en el historial — nunca hard delete (Documento Maestro
 * §7.6) — solo que su efecto en el ledger ya está anulado.
 */
export async function eliminarGasto(entrada: EliminarGastoEntrada): Promise<void> {
  const fechaReferencia = entrada.fechaReferencia ?? new Date();

  await conTenant(entrada.tenantId, async (tx) => {
    const gastoOriginal = await cargarGastoParaCorreccionTx(tx, entrada.tenantId, entrada.gastoId);
    const periodoActivo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia);

    await revertirMovimientoTx(
      tx,
      entrada.tenantId,
      gastoOriginal.movimientoId,
      periodoActivo.cuentaId,
      fechaISO(fechaReferencia),
      'Reversión por eliminación de gasto'
    );
  });
}

export interface EditarGastoEntrada {
  tenantId: string;
  gastoId: string;
  /** Siempre positivo — mismo criterio que registrarGasto. */
  monto: bigint;
  moneda: string;
  nota?: string;
  fechaReferencia?: Date;
}

export interface GastoEditado {
  id: string;
  movimientoId: string;
  periodoId: string;
  /** true si el gasto original pertenecía a un periodo ya cerrado (openapi.yaml EditarGastoResultado). */
  ajusteGenerado: boolean;
}

/**
 * "Edita" un gasto revirtiendo el original (igual que eliminarGasto) y
 * registrando uno nuevo con el monto corregido — ambos contra el
 * periodo activo actual, nunca contra la fila vieja. La fila nueva de
 * `gastos` es la que representa el gasto corregido de aquí en adelante;
 * la original se queda en el historial, intacta pero neutralizada.
 *
 * `ajusteGenerado` se deriva comparando el periodo activo actual contra
 * el periodo original del gasto: si coinciden, el original seguía activo
 * (edición "de siempre"); si difieren, el original ya había cerrado y
 * esto sí cruzó al periodo siguiente.
 */
export async function editarGasto(entrada: EditarGastoEntrada): Promise<GastoEditado> {
  if (entrada.monto <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto de un gasto debe ser positivo');
  }
  const fechaReferencia = entrada.fechaReferencia ?? new Date();

  return conTenant(entrada.tenantId, async (tx) => {
    const gastoOriginal = await cargarGastoParaCorreccionTx(tx, entrada.tenantId, entrada.gastoId);
    const periodoActivo = await periodoActivoObligatorioTx(tx, entrada.tenantId, fechaReferencia);
    const fecha = fechaISO(fechaReferencia);

    await revertirMovimientoTx(
      tx,
      entrada.tenantId,
      gastoOriginal.movimientoId,
      periodoActivo.cuentaId,
      fecha,
      'Reversión por edición de gasto'
    );

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'gasto',
      moneda: entrada.moneda,
      fechaEfectiva: fecha,
      nota: entrada.nota,
      partidas: [
        { cuentaId: periodoActivo.cuentaId, montoValorMinimo: -entrada.monto },
        { cuentaId: null, montoValorMinimo: entrada.monto },
      ],
    });

    const [gastoNuevo] = await tx
      .insert(gastos)
      .values({ tenantId: entrada.tenantId, periodoId: periodoActivo.id, movimientoId })
      .returning({ id: gastos.id });
    if (!gastoNuevo) throw new Error('No se pudo registrar el gasto corregido');

    return {
      id: gastoNuevo.id,
      movimientoId,
      periodoId: periodoActivo.id,
      ajusteGenerado: periodoActivo.id !== gastoOriginal.periodoId,
    };
  });
}

export interface GastoDetallado {
  id: string;
  periodoId: string;
  montoValorMinimo: bigint;
  moneda: string;
  fechaEfectiva: string;
  fechaRegistro: Date;
  nota: string | null;
}

export interface ListarGastosOpciones {
  cursor?: string;
  limite?: number;
  fechaReferencia?: Date;
}

export interface GastosPaginados {
  datos: GastoDetallado[];
  siguienteCursor: string | null;
}

const LIMITE_GASTOS_DEFAULT = 50;
const LIMITE_GASTOS_MAXIMO = 200;

/**
 * Cursor opaco = `fechaRegistro|id` en base64url, la misma pareja que
 * ordena y desempata la página (`fechaRegistro` no es única por sí sola
 * si dos gastos se registran en el mismo milisegundo). No es un id de
 * fila real ni expone nada que el cliente no haya visto ya en la
 * página anterior — solo evita que module offset-based pagination sea
 * inconsistente si se insertan gastos nuevos entre una página y otra.
 */
function codificarCursorGasto(fechaRegistro: Date, id: string): string {
  return Buffer.from(`${fechaRegistro.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodificarCursorGasto(cursor: string): { fechaRegistro: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const fechaRegistro = iso ? new Date(iso) : null;
  if (!fechaRegistro || Number.isNaN(fechaRegistro.getTime()) || !id) {
    throw new ErrorDominio('VALIDACION', 'El cursor no es válido');
  }
  return { fechaRegistro, id };
}

/**
 * openapi.yaml `GET /periodos/{periodoId}/gastos`: a diferencia de
 * ingresos, sí pagina — es el evento más frecuente del sistema
 * (modelo-dominio.md §4), un periodo activo puede acumular muchos.
 * Orden más reciente primero, igual que ingresos.
 */
export async function listarGastos(
  tenantId: string,
  periodoId: string,
  opciones: ListarGastosOpciones = {}
): Promise<GastosPaginados> {
  const limite = Math.max(1, Math.min(opciones.limite ?? LIMITE_GASTOS_DEFAULT, LIMITE_GASTOS_MAXIMO));
  const fechaReferencia = opciones.fechaReferencia ?? new Date();
  const cursor = opciones.cursor ? decodificarCursorGasto(opciones.cursor) : null;

  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId, fechaReferencia);
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }

    const condiciones = [eq(gastos.tenantId, tenantId), eq(gastos.periodoId, periodoId)];
    if (cursor) {
      // Página siguiente: estrictamente "antes" del último elemento ya
      // visto, en el mismo orden (fechaRegistro desc, id desc como
      // desempate).
      condiciones.push(
        or(
          lt(movimientos.fechaRegistro, cursor.fechaRegistro),
          and(eq(movimientos.fechaRegistro, cursor.fechaRegistro), lt(gastos.id, cursor.id))
        )!
      );
    }

    const filas = await tx
      .select({
        id: gastos.id,
        montoValorMinimo: asientos.montoValorMinimo,
        moneda: movimientos.moneda,
        fechaEfectiva: movimientos.fechaEfectiva,
        fechaRegistro: movimientos.fechaRegistro,
        nota: movimientos.nota,
      })
      .from(gastos)
      .innerJoin(movimientos, eq(movimientos.id, gastos.movimientoId))
      .innerJoin(asientos, and(eq(asientos.movimientoId, gastos.movimientoId), isNotNull(asientos.cuentaId)))
      .where(and(...condiciones))
      .orderBy(desc(movimientos.fechaRegistro), desc(gastos.id))
      .limit(limite + 1);

    const hayMas = filas.length > limite;
    const pagina = hayMas ? filas.slice(0, limite) : filas;
    const ultima = pagina[pagina.length - 1];

    return {
      datos: pagina.map((fila) => ({
        id: fila.id,
        periodoId,
        montoValorMinimo: -fila.montoValorMinimo,
        moneda: fila.moneda,
        fechaEfectiva: fila.fechaEfectiva,
        fechaRegistro: fila.fechaRegistro,
        nota: fila.nota,
      })),
      siguienteCursor: hayMas && ultima ? codificarCursorGasto(ultima.fechaRegistro, ultima.id) : null,
    };
  });
}
