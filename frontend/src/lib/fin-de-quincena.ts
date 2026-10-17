/**
 * Aviso de que la quincena está por terminar (pedido del usuario, 2026-10-16). Hallazgo real: un usuario no sabía que la
 * quincena se cierra sola; le pagaron un día antes, intentó "crear" la siguiente, cerró y registró y borró cosas, y se
 * enredó con su sobrante. Desde tres días antes del cierre, Inicio explica qué va a pasar y que no tiene que hacer nada.
 *
 * Lógica pura (sin React) para que la web y la app de Android usen el mismo cálculo y los mismos textos.
 */

/** Desde cuántos días antes del último día se avisa (3 = el 12 en una quincena que termina el 15). */
export const DIAS_DE_AVISO = 3;

export interface AvisoFinDeQuincena {
  titulo: string;
  texto: string;
}

/** Días de calendario entre dos fechas 'YYYY-MM-DD' (b − a). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** '2026-10-15' → "15 de octubre". */
function diaYMes(fechaIso: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${fechaIso}T00:00:00Z`));
}

/** El día del mes en que empieza la quincena siguiente ("16" o "1"). */
function diaSiguiente(fechaFin: string): number {
  return new Date(Date.parse(`${fechaFin}T00:00:00Z`) + 86_400_000).getUTCDate();
}

/** ¿Faltan `DIAS_DE_AVISO` días o menos para el último día de la quincena (incluido el último)? */
export function quincenaPorTerminar(fechaFin: string, hoy: string): boolean {
  const faltan = diasEntre(hoy, fechaFin);
  return faltan >= 0 && faltan <= DIAS_DE_AVISO;
}

/** El aviso que toca hoy, o `null` si todavía no es momento (o la quincena ya terminó). */
export function avisoFinDeQuincena(fechaFin: string, hoy: string): AvisoFinDeQuincena | null {
  if (!quincenaPorTerminar(fechaFin, hoy)) return null;
  const faltan = diasEntre(hoy, fechaFin);
  const ultimoDia = diaYMes(fechaFin);
  const siguiente = diaSiguiente(fechaFin);

  if (faltan === 0) {
    return {
      titulo: 'Hoy es el último día de tu quincena.',
      texto:
        'Se cierra sola esta noche, no tienes que hacer nada. Mañana te pediremos empezar la nueva quincena y decidir qué hacer con lo que te haya sobrado. Si ya te pagaron la siguiente, regístrala mañana al empezarla.',
    };
  }
  if (faltan === 1) {
    return {
      titulo: 'Tu quincena termina mañana.',
      texto: `El ${ultimoDia} es su último día. No tienes que cerrarla: se cierra sola al terminar el día. El ${siguiente} te pediremos empezar la nueva quincena y decidir qué hacer con lo que te haya sobrado.`,
    };
  }
  return {
    titulo: 'Tu quincena está por terminar.',
    texto: `Le quedan ${faltan} días: termina el ${ultimoDia}. No tienes que hacer nada: se cierra sola al terminar ese día. El ${siguiente} te pediremos empezar la nueva quincena y decidir qué hacer con lo que te haya sobrado: pasarlo a la siguiente o guardarlo en una meta.`,
  };
}

/** Nota del formulario de ingreso en esos mismos días: si el dinero es de la quincena siguiente, que no lo anote hoy. */
export const NOTA_INGRESO_FIN_DE_QUINCENA =
  '¿Este dinero es para la siguiente quincena? Regístralo cuando la empieces. Si lo anotas hoy, se suma a lo que puedes gastar en los días que le quedan a esta.';
