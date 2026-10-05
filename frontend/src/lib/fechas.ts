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

/**
 * A diferencia de `formatearRangoFechas`, `creadoEn` sí es un instante
 * real (con hora), no una fecha de calendario pura — aquí sí tiene
 * sentido mostrarlo en la zona local del navegador, sin forzar UTC.
 * Usado solo para distinguir dos periodos que comparten el mismo rango
 * de fechas (ver Historial.tsx) — nunca se muestra si no hace falta.
 */
export function formatearFechaHora(fechaIso: string): string {
  const formato = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return formato.format(new Date(fechaIso));
}

/** Como `formatearFechaHora`, pero sin la hora — "vigente hasta" (Ajustes.tsx) no la necesita. */
export function formatearFecha(fechaIso: string): string {
  const formato = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return formato.format(new Date(fechaIso));
}

/**
 * Fecha local del navegador, no UTC — evita que "hoy" salte al día
 * siguiente desde las 6pm hora de México (ver backend/src/shared/fechas.ts).
 * Antes duplicada en FormularioGasto.tsx y FormularioIngreso.tsx.
 */
export function hoyISO(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * La quincena de calendario en la que cae hoy (ADR-004): del 1 al 15, o del 16 al
 * último día del mes. Es la misma regla del backend (`calcularQuincenaDeCalendario`),
 * solo para decirle al usuario, antes de crear su periodo, cuál va a ser.
 */
export function quincenaDeHoy(): { fechaInicio: string; fechaFin: string } {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();
  const aISO = (dia: number) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  if (ahora.getDate() <= 15) return { fechaInicio: aISO(1), fechaFin: aISO(15) };
  return { fechaInicio: aISO(16), fechaFin: aISO(new Date(anio, mes + 1, 0).getDate()) };
}

/** 'YYYY-MM-DD' (fecha pura, como fechaEfectiva) → "Hoy" o "16 sept", en la zona local — para listas de actividad, nunca para columnas `date` de un periodo (ver formatearRangoFechas). */
export function formatearFechaActividad(fechaIso: string): string {
  if (fechaIso === hoyISO()) return 'Hoy';
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const formato = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  return formato.format(new Date(anio, mes - 1, dia));
}
