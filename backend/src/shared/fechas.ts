/**
 * Fecha de calendario UTC de un `Date`, como 'YYYY-MM-DD'. Usada donde
 * se necesita comparar un `Date` contra columnas `date` (que no llevan
 * hora) — deliberadamente sin ninguna zona horaria de por medio: recibe
 * el `Date` que sea (una hora explícita en un test, o `ahoraEnMexico()`
 * más abajo cuando el llamador de verdad quiere "hoy") y solo extrae el
 * día calendario UTC de esa instancia — nunca decide por su cuenta qué
 * instante usar.
 */
export function fechaISO(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * México sin horario de verano desde 2022 (excepto Baja California y la
 * franja fronteriza de Chihuahua/Coahuila/Nuevo León/Tamaulipas, no
 * cubierta aquí — ver documento-maestro-v2.md §6.11) — offset fijo de
 * -6h, sin necesidad de tzdata/Intl para resolverlo.
 */
const OFFSET_MEXICO_MS = -6 * 60 * 60 * 1000;

/**
 * **Hallazgo real, reportado por el usuario contra su cuenta real:**
 * cada default de `fechaReferencia` en el código era `new Date()` — la
 * hora real, en UTC. Pasado por `fechaISO` (arriba, siempre UTC puro),
 * eso hace que "hoy" salte al día siguiente desde las 6pm hora de
 * México en adelante (18:00 CST = 00:00 UTC). Un gasto capturado a las
 * 9pm con fecha correcta (hoy) dejaba de coincidir con lo que
 * `consultarDisponible` consideraba "hoy" (mañana, según el reloj UTC
 * crudo) — el gasto bajaba el disponible total bien, pero nunca se
 * restaba del objetivo del día, exactamente el síntoma reportado.
 *
 * La corrección **no toca `fechaISO`** (sigue siendo una extracción UTC
 * pura, sin sorpresas, y así se mantienen intactas todas las fechas de
 * referencia explícitas que ya usan los tests) — en cambio, esto
 * reemplaza cada default `new Date()` que de verdad significaba
 * "ahora mismo, en México" por un `Date` corrido -6h. `getUTC*()` sobre
 * ese `Date` corrido (vía `fechaISO` o directo, como en
 * `motor-flujo-caja.ts`) da el día calendario real de México, no el de
 * UTC. El propio CLAUDE.md ya pedía esto desde el inicio ("todo en UTC,
 * resuelto a la zona IANA del usuario al leer") — nunca se había
 * implementado, quedó documentado como pendiente hasta que un caso de
 * uso real lo destapó.
 *
 * El `Date` que devuelve **no es un instante real** — nunca guardarlo
 * como timestamp (`creadoEn`, `decisionSobranteFecha`, etc. siguen
 * usando `new Date()` de verdad). Sirve únicamente para extraer un día
 * calendario correcto de "ahora", en cualquier default de
 * `fechaReferencia` que antes decía `new Date()`.
 */
export function ahoraEnMexico(): Date {
  return new Date(Date.now() + OFFSET_MEXICO_MS);
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
