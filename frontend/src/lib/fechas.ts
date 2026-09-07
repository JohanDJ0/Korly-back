/**
 * `timeZone: 'UTC'` es obligatorio aquí: las fechas de periodo son
 * 'YYYY-MM-DD' puros (sin hora), y el `Date` que se construye a partir
 * de ellas cae en medianoche UTC — formatear con la zona local del
 * navegador (México, UTC-6) los correría un día hacia atrás (1 de
 * septiembre se vería como 31 de agosto).
 */
export function formatearRangoFechas(fechaInicio: string, fechaFin: string): string {
  const formato = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const inicio = new Date(`${fechaInicio}T00:00:00Z`);
  const fin = new Date(`${fechaFin}T00:00:00Z`);
  return `${formato.format(inicio)} – ${formato.format(fin)}`;
}
