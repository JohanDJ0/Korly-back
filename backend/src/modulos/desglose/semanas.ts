const MS_POR_DIA = 86_400_000;
const DIAS_POR_BLOQUE = 7;

export interface BloqueSemana {
  /** 1-indexado. */
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
}

function aMs(fecha: string): number {
  return Date.parse(`${fecha}T00:00:00Z`);
}

function deMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aMs(hasta) - aMs(desde)) / MS_POR_DIA);
}

/**
 * Una quincena son dos semanas más 1-2 días sueltos, no tres semanas: la
 * nómina quincenal mexicana paga el 15 y el último día del mes, y ni la
 * ley (LFT art. 88: plazo máximo de 15 días) ni el cálculo de nómina
 * (ISR quincenal = tarifa mensual ÷ 2) la subdividen — es una unidad de
 * longitud variable (ADR-004). Bloques de 7 días desde el inicio, con el
 * remanente absorbido por el último: 15 días → 7/8, 16 → 7/9, febrero
 * (13) → 7/6. Nunca queda un bloque huérfano de 1 o 2 días; como el
 * último bloque puede tener hasta 9 días, cada bloque lleva `dias` y el
 * frontend compara el promedio por día, no el total.
 */
export function calcularBloquesSemana(fechaInicio: string, fechaFin: string): BloqueSemana[] {
  const totalDias = diasEntre(fechaInicio, fechaFin) + 1;
  const cantidad = Math.max(1, Math.round(totalDias / DIAS_POR_BLOQUE));
  const inicioMs = aMs(fechaInicio);

  return Array.from({ length: cantidad }, (_, indice) => {
    const desdeDia = indice * DIAS_POR_BLOQUE;
    const esUltimo = indice === cantidad - 1;
    const hastaDia = esUltimo ? totalDias - 1 : desdeDia + DIAS_POR_BLOQUE - 1;
    return {
      numero: indice + 1,
      fechaInicio: deMs(inicioMs + desdeDia * MS_POR_DIA),
      fechaFin: deMs(inicioMs + hastaDia * MS_POR_DIA),
      dias: hastaDia - desdeDia + 1,
    };
  });
}

/**
 * Cuántos días del bloque ya pasaron a la fecha `hoy` (incluyéndola): 0 si
 * el bloque aún no empieza, todos si ya terminó o hoy es su último día.
 */
export function diasTranscurridosDelBloque(bloque: BloqueSemana, hoy: string): number {
  if (hoy < bloque.fechaInicio) return 0;
  if (hoy >= bloque.fechaFin) return bloque.dias;
  return diasEntre(bloque.fechaInicio, hoy) + 1;
}

/** Índice (0-based) del bloque al que pertenece `fecha`; la fecha ya debe estar dentro del periodo (ver `acotarFecha`). */
export function indiceBloque(fechaInicio: string, fecha: string, cantidadBloques: number): number {
  return Math.min(Math.floor(diasEntre(fechaInicio, fecha) / DIAS_POR_BLOQUE), cantidadBloques - 1);
}

/**
 * Un gasto puede capturarse con una fecha fuera del periodo (el campo de
 * fecha es libre); se acota al rango para que la suma de los bloques
 * siempre coincida con el total del periodo — el resumen cuenta todo lo
 * de la cuenta del periodo sin importar la fecha.
 */
export function acotarFecha(fecha: string, fechaInicio: string, fechaFin: string): string {
  if (fecha < fechaInicio) return fechaInicio;
  if (fecha > fechaFin) return fechaFin;
  return fecha;
}
