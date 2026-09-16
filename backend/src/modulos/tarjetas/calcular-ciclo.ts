import { fechaISO } from '../../shared/fechas.js';

/**
 * Fecha límite de pago de la mensualidad `numeroMensualidad` (1-indexado)
 * de una compra hecha el `fechaCompra`, dados el día de corte y los días
 * de plazo de la tarjeta (documento-maestro-v2.md, "una compra a 12 MSI
 * genera 12 compromisos futuros" — ver modulos/tarjetas/registrar-cargo.ts).
 *
 * Regla real de los bancos mexicanos: una compra hecha ANTES o EN el día
 * de corte del mes cae en el corte de ESE mes; después, cae en el corte
 * del mes SIGUIENTE. Cada mensualidad subsecuente cae un corte después
 * de la anterior. La fecha límite de pago es el corte + `diasParaPago`
 * días — nunca un día fijo del mes (evita el caso de una fecha límite
 * que cayera antes que su propio corte en meses cortos).
 *
 * `Math.min(diaCorte, últimoDíaDelMes)` reutiliza el mismo truco que
 * `calcular-quincena.ts` para el día de corte en meses con menos días
 * que `diaCorte` (p. ej. corte día 31 en febrero → corte el 28/29).
 */
export function calcularVencimientoMensualidad(
  fechaCompra: Date,
  diaCorte: number,
  diasParaPago: number,
  numeroMensualidad: number
): string {
  const diaCompra = fechaCompra.getUTCDate();
  const corteVencidoElMismoMes = diaCompra <= diaCorte;

  let mesCorte = fechaCompra.getUTCMonth() + (corteVencidoElMismoMes ? 0 : 1);
  mesCorte += numeroMensualidad - 1;

  const anioCorte = fechaCompra.getUTCFullYear() + Math.floor(mesCorte / 12);
  const mesCorteNormalizado = ((mesCorte % 12) + 12) % 12;

  const ultimoDiaDelMesDeCorte = new Date(Date.UTC(anioCorte, mesCorteNormalizado + 1, 0)).getUTCDate();
  const diaCorteReal = Math.min(diaCorte, ultimoDiaDelMesDeCorte);

  const fechaCorte = Date.UTC(anioCorte, mesCorteNormalizado, diaCorteReal);
  const fechaVencimiento = new Date(fechaCorte + diasParaPago * 86_400_000);

  return fechaISO(fechaVencimiento);
}
