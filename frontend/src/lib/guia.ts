/**
 * Guía de primeros pasos (onboarding). Son avisos en línea dentro de las pantallas reales, no un tour con globos
 * flotantes: cada paso aparece solo cuando la persona llega a ese punto del uso (sin quincena, sin ingreso, con la
 * cifra, tras su primer gasto…) y es siempre saltable. Aquí vive la lógica pura y los textos; los componentes
 * (`PasoDeGuia`, Home, FormularioGasto, Ajustes) solo los pintan.
 *
 * **Quién la ve:** las cuentas creadas desde `GUIA_DESDE` (las anteriores ya saben usar la app) o quien pida
 * "Ver la guía otra vez" en Ajustes. `guia_terminada` en los metadatos de la cuenta manda sobre la fecha
 * (`true` la apaga en todos los dispositivos, `false` la enciende); qué pasos ya se vieron se recuerda en el
 * navegador (stores/guia-store.ts).
 */
export const GUIA_DESDE = '2026-10-10T00:00:00Z';

export type PasoGuia =
  | 'bienvenida'
  | 'quincena'
  | 'ingreso'
  | 'cifra'
  | 'registrar-gasto'
  | 'atajo-formulario'
  | 'atajo-inicio'
  | 'recurrentes'
  | 'cierre';

export const PASOS_GUIA: readonly PasoGuia[] = ['bienvenida', 'quincena', 'ingreso', 'cifra', 'registrar-gasto', 'atajo-formulario', 'atajo-inicio', 'recurrentes', 'cierre'];

export function esPasoGuia(valor: unknown): valor is PasoGuia {
  return typeof valor === 'string' && (PASOS_GUIA as readonly string[]).includes(valor);
}

interface UsuarioConGuia {
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}

/** ¿Esta cuenta debe ver la guía? `guia_terminada` explícito manda; sin él, solo las cuentas nuevas. */
export function guiaActiva(usuario: UsuarioConGuia | null | undefined): boolean {
  const marca = usuario?.user_metadata?.['guia_terminada'];
  if (marca === true) return false;
  if (marca === false) return true;
  const creada = usuario?.created_at ? Date.parse(usuario.created_at) : Number.NaN;
  return Number.isFinite(creada) && creada >= Date.parse(GUIA_DESDE);
}

/** Lo que Inicio sabe de la persona en este momento, para decidir qué paso toca. */
export interface ContextoGuia {
  /** Todavía no hay quincena ("Empecemos"). */
  sinPeriodo: boolean;
  /** Hay quincena pero falta el ingreso. */
  sinIngreso: boolean;
  /** Ya hay cifra del día. */
  conCifra: boolean;
  hayAtajos: boolean;
  /** Ya registró al menos un gasto en esta quincena. */
  hayGastos: boolean;
}

/**
 * El paso de Inicio que toca ahora: el primero, en orden, que aún no se vio y que aplica a lo que la persona tiene en
 * pantalla. `null` si no toca ninguno. Los pasos que dependen de otro (`registrar-gasto` de `cifra`, `cierre` de
 * `recurrentes`) esperan a que se haya visto. `atajo-formulario` no está aquí: vive dentro del formulario de gasto.
 */
export function pasoDeInicio(vistos: ReadonlySet<PasoGuia>, contexto: ContextoGuia): PasoGuia | null {
  const aplica: Record<Exclude<PasoGuia, 'atajo-formulario'>, boolean> = {
    bienvenida: contexto.sinPeriodo,
    quincena: contexto.sinPeriodo && vistos.has('bienvenida'),
    ingreso: contexto.sinIngreso,
    cifra: contexto.conCifra,
    'registrar-gasto': contexto.conCifra && vistos.has('cifra'),
    'atajo-inicio': contexto.conCifra && contexto.hayAtajos && vistos.has('registrar-gasto'),
    recurrentes: contexto.conCifra && contexto.hayGastos && vistos.has('registrar-gasto'),
    cierre: contexto.conCifra && vistos.has('recurrentes'),
  };
  for (const paso of PASOS_GUIA) {
    if (paso === 'atajo-formulario') continue;
    if (!vistos.has(paso) && aplica[paso]) return paso;
  }
  return null;
}

/** Textos de la guía, tal como se aprobaron. */
export const TEXTOS_GUIA = {
  bienvenida: {
    titulo: 'Bienvenido a Korly',
    texto: 'Te decimos cuánto puedes gastar hoy. Solo necesitas dos datos: cuánto recibes y en qué gastas. Te acompañamos en el primer paso.',
  },
  quincena: {
    texto: 'Korly lleva tu dinero por quincenas del calendario: del 1 al 15 y del 16 al último día del mes. Cada quincena tiene sus propios ingresos y gastos.',
  },
  ingreso: {
    texto: 'Escribe lo que recibiste esta quincena, por ejemplo tu sueldo. Con eso calculamos tu cifra del día. Si te pagan en otro momento, después puedes sumar otro ingreso.',
  },
  cifra: {
    texto: 'Esta es tu cifra del día: lo que puedes gastar hoy sin pasarte de tu quincena. Se calcula con lo que te queda entre los días que faltan.',
  },
  'registrar-gasto': {
    texto: 'Cada vez que gastes, apúntalo aquí. Con el monto basta: la categoría y la nota son opcionales.',
  },
  'atajo-formulario': {
    texto: 'Si lo repites seguido, guárdalo como atajo. La próxima vez lo registras con un solo toque.',
  },
  'atajo-inicio': {
    texto: 'Toca un atajo y se registra ese gasto al instante. Si te equivocas, usa "Deshacer": aparece unos segundos.',
  },
  recurrentes: {
    titulo: '¿Tienes gastos que se repiten?',
    texto:
      'La renta, una suscripción, el gimnasio… Regístralos una sola vez en Gastos recurrentes y Korly los aplica solos cada vez que toque. Si le toca a esta quincena, se descuentan de inmediato de tu cifra del día.',
  },
  cierre: {
    titulo: 'Listo, ya sabes lo principal',
    texto:
      'Dos cosas más: el ojito oculta tus montos si estás en un lugar público. Y si un día no registras nada, te mandamos un recordatorio por correo; lo apagas en Ajustes. Puedes ver esta guía otra vez desde Ajustes.',
  },
} as const;
