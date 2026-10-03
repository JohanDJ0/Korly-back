import { and, asc, eq, inArray } from 'drizzle-orm';
import { cargosTarjeta, pagosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { asientos, movimientos } from '../../db/schema/ledger.js';
import { tarjetas } from '../../db/schema/tarjetas.js';
import { obtenerCategoriaPorIdTx } from '../categorias/categorias.js';
import { registrarMovimientoTx, revertirMovimientoTx } from '../ledger/registrar-movimiento.js';
import { obtenerPeriodoActivoTx, obtenerPeriodoPorIdTx } from '../periodos/crear-periodo.js';
import { obtenerSaldoTarjetaTx, obtenerTarjetaPorIdTx } from './tarjetas.js';
import { conTenant, type Ejecutor } from '../../shared/db.js';
import { ErrorDominio } from '../../shared/errores.js';
import { ahoraEnMexico, fechaISO } from '../../shared/fechas.js';
import { esUuidValido } from '../../shared/validacion.js';
import { calcularVencimientoMensualidad } from './calcular-ciclo.js';

async function resolverCategoriaIdTx(tx: Ejecutor, tenantId: string, categoriaId: string | null | undefined): Promise<string | null> {
  if (categoriaId === undefined || categoriaId === null) return null;
  const categoria = await obtenerCategoriaPorIdTx(tx, tenantId, categoriaId);
  if (!categoria) {
    throw new ErrorDominio('CATEGORIA_NO_ENCONTRADA', 'La categoría especificada no existe');
  }
  return categoria.id;
}

/**
 * Reparte `montoTotal` entre `numeroPlazos` mensualidades iguales,
 * cargando el residuo del redondeo a la ÚLTIMA — es la misma razón que
 * ADR-002 da para truncar la cifra diaria hacia el usuario: la suma de
 * las partes debe cerrar exacto contra el total en centavos, sin
 * inventar ni perder un centavo por dividir montos que no son
 * múltiplos exactos de `numeroPlazos` (p. ej. $100.00 entre 3 = 33.33 +
 * 33.33 + 33.34, no 33.33 × 3 = 99.99).
 */
export function repartirEnMensualidades(montoTotal: bigint, numeroPlazos: number): bigint[] {
  const base = montoTotal / BigInt(numeroPlazos);
  const residuo = montoTotal - base * BigInt(numeroPlazos);
  const mensualidades = Array.from({ length: numeroPlazos }, () => base);
  mensualidades[numeroPlazos - 1] = base + residuo;
  return mensualidades;
}

export interface RegistrarCargoEntrada {
  tenantId: string;
  tarjetaId: string;
  descripcion: string;
  montoTotalValorMinimo: bigint;
  moneda: string;
  /** 1 = compra normal (un solo pago en el siguiente corte); >1 = MSI. */
  numeroPlazos: number;
  categoriaId?: string | null;
  /** 'YYYY-MM-DD'. Por defecto, la fecha actual la resuelve el caller — mismo criterio que registrarGasto. */
  fechaCompra?: string;
}

export interface CargoRegistrado {
  id: string;
  movimientoId: string;
  mensualidades: { numeroPago: number; montoValorMinimo: bigint; fechaVencimiento: string }[];
}

/**
 * Registra una compra con tarjeta: sube la deuda de inmediato (el
 * cargo, contra una contraparte externa — el comercio) y calcula, de
 * una sola vez, las `numeroPlazos` mensualidades futuras con sus
 * fechas de vencimiento reales. Ninguna mensualidad toca el disponible
 * de ningún periodo todavía — eso ocurre después, una por una, cuando
 * a cada una le toca (`materializar-pagos-tarjeta.ts`, mismo mecanismo
 * que `materializarRecurrentesTx`).
 *
 * El límite de crédito SÍ se bloquea (a diferencia del "presupuesto",
 * que nunca bloquea): es un tope físico real, no una guía — decisión
 * explícita del usuario al diseñar esta feature.
 */
export async function registrarCargoTarjeta(entrada: RegistrarCargoEntrada): Promise<CargoRegistrado> {
  const descripcionLimpia = entrada.descripcion.trim();
  if (descripcionLimpia.length === 0) {
    throw new ErrorDominio('VALIDACION', "El campo 'descripcion' no puede estar vacío");
  }
  if (entrada.montoTotalValorMinimo <= 0n) {
    throw new ErrorDominio('VALIDACION', 'El monto del cargo debe ser positivo');
  }
  if (!Number.isInteger(entrada.numeroPlazos) || entrada.numeroPlazos < 1) {
    throw new ErrorDominio('VALIDACION', "El campo 'numeroPlazos' debe ser un entero mayor o igual a 1");
  }
  const fechaEfectiva = entrada.fechaCompra ?? fechaISO(ahoraEnMexico());

  return conTenant(entrada.tenantId, async (tx) => {
    const tarjeta = await obtenerTarjetaPorIdTx(tx, entrada.tenantId, entrada.tarjetaId);
    if (!tarjeta) {
      throw new ErrorDominio('TARJETA_NO_ENCONTRADA', 'La tarjeta especificada no existe');
    }

    const saldoActual = await obtenerSaldoTarjetaTx(tx, tarjeta.cuentaId);
    const creditoDisponible = tarjeta.limiteCreditoValorMinimo + saldoActual;
    if (entrada.montoTotalValorMinimo > creditoDisponible) {
      // Sin el monto en el mensaje a propósito: ADR-002 reserva la
      // conversión de centavos a presentación para un solo lugar (el
      // límite HTTP / el frontend, nunca un mensaje de error de
      // dominio) — el cliente ya ve el crédito disponible en la lista
      // de tarjetas, no hace falta repetirlo aquí en centavos crudos.
      throw new ErrorDominio('LIMITE_CREDITO_EXCEDIDO', 'El cargo excede el crédito disponible de la tarjeta');
    }

    const categoriaId = await resolverCategoriaIdTx(tx, entrada.tenantId, entrada.categoriaId);

    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId: entrada.tenantId,
      tipo: 'cargo_tarjeta',
      moneda: entrada.moneda,
      fechaEfectiva,
      nota: descripcionLimpia,
      partidas: [
        { cuentaId: tarjeta.cuentaId, montoValorMinimo: -entrada.montoTotalValorMinimo },
        { cuentaId: null, montoValorMinimo: entrada.montoTotalValorMinimo },
      ],
    });

    const [cargo] = await tx
      .insert(cargosTarjeta)
      .values({
        tenantId: entrada.tenantId,
        tarjetaId: tarjeta.id,
        movimientoId,
        descripcion: descripcionLimpia,
        montoTotalValorMinimo: entrada.montoTotalValorMinimo,
        moneda: entrada.moneda,
        numeroPlazos: entrada.numeroPlazos,
        categoriaId,
        fechaCompra: fechaEfectiva,
      })
      .returning({ id: cargosTarjeta.id });
    if (!cargo) throw new Error('No se pudo registrar el cargo');

    const montos = repartirEnMensualidades(entrada.montoTotalValorMinimo, entrada.numeroPlazos);
    const fechaCompraDate = new Date(`${fechaEfectiva}T00:00:00Z`);
    const mensualidades: CargoRegistrado['mensualidades'] = [];

    for (let numeroPago = 1; numeroPago <= entrada.numeroPlazos; numeroPago++) {
      const fechaVencimiento = calcularVencimientoMensualidad(fechaCompraDate, tarjeta.diaCorte, tarjeta.diasParaPago, numeroPago);
      const montoValorMinimo = montos[numeroPago - 1]!;
      await tx.insert(pagosTarjeta).values({
        tenantId: entrada.tenantId,
        cargoTarjetaId: cargo.id,
        numeroPago,
        montoValorMinimo,
        fechaVencimiento,
      });
      mensualidades.push({ numeroPago, montoValorMinimo, fechaVencimiento });
    }

    return { id: cargo.id, movimientoId, mensualidades };
  });
}

export interface CargoDetallado {
  id: string;
  descripcion: string;
  montoTotalValorMinimo: bigint;
  moneda: string;
  numeroPlazos: number;
  categoriaId: string | null;
  fechaCompra: string;
  /** true si `eliminarCargoTarjeta` ya corrigió este cargo (mismo criterio que `revertido` en listarGastos). */
  revertido: boolean;
  mensualidades: { numeroPago: number; montoValorMinimo: bigint; fechaVencimiento: string; pagado: boolean }[];
}

/** Extensión propia: listar las compras de una tarjeta con el detalle de sus mensualidades, para que el usuario vea qué le falta por pagar y cuándo. */
export async function listarCargosTarjeta(tenantId: string, tarjetaId: string): Promise<CargoDetallado[]> {
  return conTenant(tenantId, async (tx) => {
    const tarjeta = await obtenerTarjetaPorIdTx(tx, tenantId, tarjetaId);
    if (!tarjeta) {
      throw new ErrorDominio('TARJETA_NO_ENCONTRADA', 'La tarjeta especificada no existe');
    }

    const cargos = await tx
      .select({
        id: cargosTarjeta.id,
        descripcion: cargosTarjeta.descripcion,
        montoTotalValorMinimo: cargosTarjeta.montoTotalValorMinimo,
        moneda: cargosTarjeta.moneda,
        numeroPlazos: cargosTarjeta.numeroPlazos,
        categoriaId: cargosTarjeta.categoriaId,
        fechaCompra: cargosTarjeta.fechaCompra,
        movimientoId: cargosTarjeta.movimientoId,
      })
      .from(cargosTarjeta)
      .where(and(eq(cargosTarjeta.tenantId, tenantId), eq(cargosTarjeta.tarjetaId, tarjetaId)))
      .orderBy(asc(cargosTarjeta.fechaCompra));

    // Mismo criterio que listarGastos (registrar-gasto.ts): "¿ya se
    // revirtió?" se responde con una segunda consulta sobre la misma
    // tabla de movimientos, no con una columna de estado propia — el
    // ledger ya lo sabe.
    const movimientoIds = cargos.map((c) => c.movimientoId);
    const revertidos =
      movimientoIds.length === 0
        ? []
        : await tx
            .select({ movimientoRevertidoId: movimientos.movimientoRevertidoId })
            .from(movimientos)
            .where(and(eq(movimientos.tenantId, tenantId), inArray(movimientos.movimientoRevertidoId, movimientoIds)));
    const idsRevertidos = new Set(revertidos.map((fila) => fila.movimientoRevertidoId));

    const resultado: CargoDetallado[] = [];
    for (const cargo of cargos) {
      const pagos = await tx
        .select({
          numeroPago: pagosTarjeta.numeroPago,
          montoValorMinimo: pagosTarjeta.montoValorMinimo,
          fechaVencimiento: pagosTarjeta.fechaVencimiento,
          movimientoId: pagosTarjeta.movimientoId,
        })
        .from(pagosTarjeta)
        .where(and(eq(pagosTarjeta.tenantId, tenantId), eq(pagosTarjeta.cargoTarjetaId, cargo.id)))
        .orderBy(asc(pagosTarjeta.numeroPago));

      resultado.push({
        ...cargo,
        revertido: idsRevertidos.has(cargo.movimientoId),
        mensualidades: pagos.map((p) => ({
          numeroPago: p.numeroPago,
          montoValorMinimo: p.montoValorMinimo,
          fechaVencimiento: p.fechaVencimiento,
          pagado: p.movimientoId !== null,
        })),
      });
    }
    return resultado;
  });
}

export interface EliminarCargoEntrada {
  tenantId: string;
  tarjetaId: string;
  cargoId: string;
  fechaReferencia?: Date;
}

export interface CargoCorregido {
  mensualidadesRevertidas: number;
  mensualidadesEliminadas: number;
}

/**
 * `revertirMovimientoTx` (ledger/registrar-movimiento.ts) asume una sola
 * pata "real" (cuenta) y una externa (`cuentaId: null`) — cierto para
 * gastos/ingresos/cargo_tarjeta, falso para `pago_tarjeta`, que es una
 * transferencia interna con DOS patas reales (periodo ↔ tarjeta, mismo
 * patrón que `arrastre_sobrante`). Reutilizar el helper genérico ahí
 * redirigiría las DOS patas a `cuentaDestino`, dejando la pata de la
 * tarjeta sin revertir de verdad — hallazgo real, atrapado por el test
 * de esta función. Esta versión solo redirige la pata del periodo (a
 * la del periodo activo de hoy, igual que cualquier corrección); la de
 * la tarjeta se revierte contra sí misma.
 */
async function revertirPagoTarjetaTx(
  tx: Ejecutor,
  tenantId: string,
  pagoMovimientoId: string,
  tarjetaCuentaId: string,
  periodoActivoCuentaId: string,
  fechaEfectiva: string,
  nota: string
): Promise<void> {
  const [movimientoOriginal] = await tx
    .select({ moneda: movimientos.moneda })
    .from(movimientos)
    .where(and(eq(movimientos.tenantId, tenantId), eq(movimientos.id, pagoMovimientoId)))
    .limit(1);
  if (!movimientoOriginal) throw new Error('No se encontró el pago de tarjeta a revertir');

  const asientosOriginales = await tx
    .select({ cuentaId: asientos.cuentaId, montoValorMinimo: asientos.montoValorMinimo })
    .from(asientos)
    .where(and(eq(asientos.tenantId, tenantId), eq(asientos.movimientoId, pagoMovimientoId)));

  const partidasInvertidas = asientosOriginales.map((asiento) => ({
    cuentaId: asiento.cuentaId === tarjetaCuentaId ? tarjetaCuentaId : periodoActivoCuentaId,
    montoValorMinimo: -asiento.montoValorMinimo,
  }));

  await registrarMovimientoTx(tx, {
    tenantId,
    tipo: 'reversion',
    moneda: movimientoOriginal.moneda,
    fechaEfectiva,
    nota,
    movimientoRevertidoId: pagoMovimientoId,
    partidas: partidasInvertidas,
  });
}

/**
 * Corrige un cargo mal registrado, siempre por reversión, nunca por
 * borrado — ni siquiera cuando ninguna mensualidad había cobrado
 * todavía. `asientos`/`movimientos` tienen un trigger de Postgres que
 * rechaza cualquier `UPDATE`/`DELETE` sobre ellos sin excepción (ver
 * `ledger_bloquear_mutacion`, migración 0002): ADR-001 aquí no es solo
 * una convención de la aplicación, la base de datos misma lo impide.
 * Un intento anterior de esta función borraba de verdad el movimiento
 * del cargo cuando ninguna mensualidad se había cobrado — el propio
 * trigger lo rechazó en pruebas contra Postgres real.
 *
 * Por eso una tarjeta con al menos un cargo, por corregido que esté,
 * nunca vuelve a tener cero filas en `cargos_tarjeta` — `eliminarTarjeta`
 * (tarjetas.ts) sigue bloqueada para siempre en cuanto existe un primer
 * cargo, sin ningún caso especial que distinga "corregido" de "real".
 *
 * Lo que SÍ se revierte de verdad:
 * - El movimiento del cargo, contra la propia cuenta de la tarjeta.
 * - Cada mensualidad que YA se hubiera cobrado sola
 *   (`materializarPagosTarjetaTx`), devolviendo ese dinero al disponible
 *   del periodo ACTIVO de hoy — nunca al periodo original, que puede ya
 *   estar cerrado (misma regla que `eliminarGasto`).
 *
 * Lo único que sí se borra: las mensualidades que todavía no se habían
 * cobrado (`pagos_tarjeta` sin `movimiento_id`) — son solo una fecha
 * programada a futuro, nunca generaron ningún asiento, así que borrarlas
 * no choca con ningún trigger ni con ADR-001.
 */
export async function eliminarCargoTarjeta(entrada: EliminarCargoEntrada): Promise<CargoCorregido> {
  const fechaReferencia = entrada.fechaReferencia ?? ahoraEnMexico();

  return conTenant(entrada.tenantId, async (tx) => {
    if (!esUuidValido(entrada.cargoId)) {
      throw new ErrorDominio('CARGO_NO_ENCONTRADO', 'El cargo especificado no existe');
    }

    const [cargo] = await tx
      .select({ id: cargosTarjeta.id, movimientoId: cargosTarjeta.movimientoId, tarjetaId: cargosTarjeta.tarjetaId })
      .from(cargosTarjeta)
      .where(and(eq(cargosTarjeta.tenantId, entrada.tenantId), eq(cargosTarjeta.id, entrada.cargoId), eq(cargosTarjeta.tarjetaId, entrada.tarjetaId)))
      .limit(1);
    if (!cargo) {
      throw new ErrorDominio('CARGO_NO_ENCONTRADO', 'El cargo especificado no existe');
    }

    const [reversionExistente] = await tx
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(and(eq(movimientos.tenantId, entrada.tenantId), eq(movimientos.movimientoRevertidoId, cargo.movimientoId)))
      .limit(1);
    if (reversionExistente) {
      throw new ErrorDominio('CARGO_YA_REVERTIDO', 'Este cargo ya fue corregido antes');
    }

    const tarjeta = await obtenerTarjetaPorIdTx(tx, entrada.tenantId, cargo.tarjetaId);
    if (!tarjeta) {
      throw new ErrorDominio('TARJETA_NO_ENCONTRADA', 'La tarjeta especificada no existe');
    }

    const pagos = await tx
      .select({ id: pagosTarjeta.id, movimientoId: pagosTarjeta.movimientoId })
      .from(pagosTarjeta)
      .where(and(eq(pagosTarjeta.tenantId, entrada.tenantId), eq(pagosTarjeta.cargoTarjetaId, cargo.id)));

    const materializados = pagos.filter((p): p is { id: string; movimientoId: string } => p.movimientoId !== null);
    const pendientes = pagos.filter((p) => p.movimientoId === null);

    if (materializados.length > 0) {
      const periodoActivo = await obtenerPeriodoActivoTx(tx, entrada.tenantId, fechaReferencia);
      if (!periodoActivo) {
        throw new ErrorDominio('SIN_PERIODO_ACTIVO', 'No hay periodo activo para aplicar el ajuste de las mensualidades ya cobradas');
      }
      for (const pago of materializados) {
        await revertirPagoTarjetaTx(
          tx,
          entrada.tenantId,
          pago.movimientoId,
          tarjeta.cuentaId,
          periodoActivo.cuentaId,
          fechaISO(fechaReferencia),
          'Reversión por corrección de cargo de tarjeta'
        );
      }
    }

    if (pendientes.length > 0) {
      await tx.delete(pagosTarjeta).where(
        and(
          eq(pagosTarjeta.tenantId, entrada.tenantId),
          inArray(
            pagosTarjeta.id,
            pendientes.map((p) => p.id)
          )
        )
      );
    }

    await revertirMovimientoTx(tx, entrada.tenantId, cargo.movimientoId, tarjeta.cuentaId, fechaISO(fechaReferencia), 'Reversión por corrección de cargo de tarjeta');

    return { mensualidadesRevertidas: materializados.length, mensualidadesEliminadas: pendientes.length };
  });
}

export interface PagoTarjetaAplicado {
  tarjetaNombre: string;
  cargoDescripcion: string;
  numeroPago: number;
  numeroPlazos: number;
  montoValorMinimo: bigint;
  moneda: string;
}

/**
 * Hallazgo real (el usuario preguntó "¿se descuenta automático o hay
 * que agregarlo a mano?"): el pago de una mensualidad SÍ se descuenta
 * solo (materializar-pagos-tarjeta.ts), pero antes no había ninguna
 * forma de enterarse de que pasó — 'pago_tarjeta' nunca aparece en
 * `listarGastos` (es un tipo de movimiento distinto, no una fila de
 * `gastos`), así que la única pista era notar, a mano, que una
 * mensualidad cambió a "Pagado" en Tarjetas → Ver compras. Esta
 * consulta es lo que permite avisar proactivamente en Home/Historial
 * (ver rutas.ts) qué pagos de tarjeta ya se aplicaron a un periodo
 * dado.
 */
export async function listarPagosTarjetaDePeriodo(tenantId: string, periodoId: string): Promise<PagoTarjetaAplicado[]> {
  return conTenant(tenantId, async (tx) => {
    const periodo = await obtenerPeriodoPorIdTx(tx, tenantId, periodoId);
    if (!periodo) {
      throw new ErrorDominio('PERIODO_NO_ENCONTRADO', 'El periodo especificado no existe');
    }

    return tx
      .select({
        tarjetaNombre: tarjetas.nombre,
        cargoDescripcion: cargosTarjeta.descripcion,
        numeroPago: pagosTarjeta.numeroPago,
        numeroPlazos: cargosTarjeta.numeroPlazos,
        montoValorMinimo: pagosTarjeta.montoValorMinimo,
        moneda: cargosTarjeta.moneda,
      })
      .from(pagosTarjeta)
      .innerJoin(cargosTarjeta, eq(cargosTarjeta.id, pagosTarjeta.cargoTarjetaId))
      .innerJoin(tarjetas, eq(tarjetas.id, cargosTarjeta.tarjetaId))
      .where(and(eq(pagosTarjeta.tenantId, tenantId), eq(pagosTarjeta.periodoId, periodoId)))
      .orderBy(asc(tarjetas.nombre), asc(pagosTarjeta.numeroPago));
  });
}
