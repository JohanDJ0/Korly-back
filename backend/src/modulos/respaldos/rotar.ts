/**
 * Nombres y rotación de los respaldos. El aviso de privacidad promete conservar las copias de seguridad como máximo
 * 30 días, así que cada respaldo lleva su fecha en el nombre y los más viejos se borran. La fecha sale del NOMBRE (no
 * de la fecha de modificación del archivo, que cambia al copiarlo o sincronizarlo) y siempre es UTC.
 */

export const DIAS_DE_RETENCION = 30;
export const EXTENSION_RESPALDO = '.korlybak';

const PATRON = /^korly-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.korlybak$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `korly-20261008T201530Z.korlybak` */
export function nombreDeRespaldo(ahora: Date): string {
  const sello = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `korly-${sello}${EXTENSION_RESPALDO}`;
}

/** La fecha guardada en el nombre, o `null` si el archivo no es un respaldo de Korly (se ignora, nunca se borra). */
export function fechaDeNombre(nombre: string): Date | null {
  const m = PATRON.exec(nombre);
  if (!m) return null;
  const [, anio, mes, dia, hora, minuto, segundo] = m.map(Number) as [number, number, number, number, number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));
  // Date.UTC "corrige" fechas imposibles (mes 13...): si no coincide, el nombre no es de un respaldo nuestro.
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? fecha : null;
}

/** Los respaldos con más de `dias` días de antigüedad. Cualquier archivo que no sea un respaldo de Korly se deja en paz. */
export function respaldosVencidos(nombres: readonly string[], ahora: Date, dias = DIAS_DE_RETENCION): string[] {
  return nombres.filter((nombre) => {
    const fecha = fechaDeNombre(nombre);
    return fecha !== null && ahora.getTime() - fecha.getTime() > dias * MS_POR_DIA;
  });
}
