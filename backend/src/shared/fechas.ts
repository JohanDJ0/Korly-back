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

/**
 * A diferencia de solo comprobar el formato `YYYY-MM-DD` con una regex,
 * esto rechaza fechas que tienen esa forma pero no existen en el
 * calendario (`2026-02-30`, `2026-13-01`) — `Date.UTC` normaliza esos
 * casos en vez de fallar (30 de febrero se vuelve 2 de marzo), así que
 * hay que verificar que los componentes sobrevivan intactos al viaje
 * de ida y vuelta. Usado por la importación de CSV (backend/README.md,
 * "Importación"), donde una fecha viene de texto libre de un archivo
 * externo, no de un `<input type="date">` que ya la valida en el navegador.
 */
export function esFechaIsoValida(fecha: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!coincidencia) return false;
  const [, anioStr, mesStr, diaStr] = coincidencia;
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));
  return fechaUtc.getUTCFullYear() === anio && fechaUtc.getUTCMonth() === mes - 1 && fechaUtc.getUTCDate() === dia;
}
