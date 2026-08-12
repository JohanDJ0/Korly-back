/**
 * Fecha de calendario UTC de un `Date`, como 'YYYY-MM-DD'. Usada donde
 * se necesita "hoy" como fecha efectiva de un movimiento o para comparar
 * contra columnas `date` (que no llevan hora) — nunca contra zona
 * horaria local, mismo criterio que modulos/periodos/calcular-quincena.ts
 * y modulos/disponible/motor-flujo-caja.ts (sin resolución a la zona
 * IANA del usuario todavía, ver README).
 */
export function fechaISO(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
