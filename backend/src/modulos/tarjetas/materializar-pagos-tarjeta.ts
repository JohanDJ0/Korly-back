import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { cargosTarjeta, pagosTarjeta } from '../../db/schema/cargos-tarjeta.js';
import { tarjetas } from '../../db/schema/tarjetas.js';
import { registrarMovimientoTx } from '../ledger/registrar-movimiento.js';
import type { Ejecutor } from '../../shared/db.js';

/**
 * Se llama exactamente en los mismos dos puntos donde un periodo se
 * vuelve genuinamente `'activo'` que `materializarRecurrentesTx`
 * (crear-periodo.ts y la promoción de borrador en cierre/cerrar-periodo.ts):
 * nunca para un periodo que se crea en `'borrador'`. Por cada
 * mensualidad de tarjeta pendiente (`movimientoId` nulo) cuya
 * `fechaVencimiento` cae dentro de la ventana de este periodo, genera
 * el `'pago_tarjeta'` real — una transferencia interna periodo → tarjeta
 * (mismo patrón que `arrastre_sobrante` entre periodo y periodo), que
 * baja el disponible de esta quincena Y la deuda de la tarjeta en la
 * misma operación.
 *
 * Igual que recurrentes: si el periodo al que le tocaba una mensualidad
 * nunca llega a activarse (el usuario deja de usar la app un tiempo),
 * esa mensualidad queda pendiente hasta que sí se active uno cuya
 * ventana la cubra — limitación conocida y aceptada, no un bug.
 */
export async function materializarPagosTarjetaTx(
  tx: Ejecutor,
  tenantId: string,
  periodo: { id: string; cuentaId: string; fechaInicio: string; fechaFin: string }
): Promise<void> {
  const pagosPendientes = await tx
    .select({
      id: pagosTarjeta.id,
      montoValorMinimo: pagosTarjeta.montoValorMinimo,
      numeroPago: pagosTarjeta.numeroPago,
      cargoDescripcion: cargosTarjeta.descripcion,
      cargoNumeroPlazos: cargosTarjeta.numeroPlazos,
      tarjetaCuentaId: tarjetas.cuentaId,
      moneda: cargosTarjeta.moneda,
    })
    .from(pagosTarjeta)
    .innerJoin(cargosTarjeta, eq(cargosTarjeta.id, pagosTarjeta.cargoTarjetaId))
    .innerJoin(tarjetas, eq(tarjetas.id, cargosTarjeta.tarjetaId))
    .where(
      and(
        eq(pagosTarjeta.tenantId, tenantId),
        isNull(pagosTarjeta.movimientoId),
        gte(pagosTarjeta.fechaVencimiento, periodo.fechaInicio),
        lte(pagosTarjeta.fechaVencimiento, periodo.fechaFin)
      )
    );

  for (const pago of pagosPendientes) {
    const { movimientoId } = await registrarMovimientoTx(tx, {
      tenantId,
      tipo: 'pago_tarjeta',
      moneda: pago.moneda,
      fechaEfectiva: periodo.fechaInicio,
      nota: `${pago.cargoDescripcion} (${pago.numeroPago}/${pago.cargoNumeroPlazos})`,
      partidas: [
        { cuentaId: periodo.cuentaId, montoValorMinimo: -pago.montoValorMinimo },
        { cuentaId: pago.tarjetaCuentaId, montoValorMinimo: pago.montoValorMinimo },
      ],
    });

    await tx.update(pagosTarjeta).set({ periodoId: periodo.id, movimientoId }).where(eq(pagosTarjeta.id, pago.id));
  }
}
