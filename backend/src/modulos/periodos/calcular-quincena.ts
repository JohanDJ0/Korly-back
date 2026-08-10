export interface RangoFechas {
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Anclaje a calendario de ADR-004: 1–15 y 16–fin de mes. Nunca "inicio +
 * N días" (eso produce drift acumulado, ver ADR-004). Longitud variable
 * (13-16 días) manejada por construcción: el fin de la segunda mitad es
 * el último día real del mes (`Date.UTC(año, mes + 1, 0)` da ese día sin
 * tabla de días-por-mes ni caso especial para bisiestos).
 *
 * Usa los getters UTC de `fechaReferencia`, no los de zona horaria local:
 * todavía no existe resolución a la zona IANA del usuario (CLAUDE.md,
 * "Todo en UTC, resuelto a la zona del usuario al leer") — pendiente
 * hasta que el módulo de periodos necesite saber la zona del usuario,
 * no antes. Mientras tanto, "hoy" es la fecha de calendario UTC del
 * servidor.
 */
export function calcularQuincenaDeCalendario(fechaReferencia: Date): RangoFechas {
  const anio = fechaReferencia.getUTCFullYear();
  const mes = fechaReferencia.getUTCMonth();
  const dia = fechaReferencia.getUTCDate();

  if (dia <= 15) {
    return {
      fechaInicio: formatearFechaISO(anio, mes, 1),
      fechaFin: formatearFechaISO(anio, mes, 15),
    };
  }

  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return {
    fechaInicio: formatearFechaISO(anio, mes, 16),
    fechaFin: formatearFechaISO(anio, mes, ultimoDiaDelMes),
  };
}

function formatearFechaISO(anio: number, mesIndiceCero: number, dia: number): string {
  const mes = String(mesIndiceCero + 1).padStart(2, '0');
  const diaFormateado = String(dia).padStart(2, '0');
  return `${anio}-${mes}-${diaFormateado}`;
}
