import { create } from 'zustand';

import { esPasoGuia, type PasoGuia } from '@/lib/guia';

const clave = (usuarioId: string) => `korly:guia:${usuarioId}`;
const claveTerminada = (usuarioId: string) => `korly:guia-terminada:${usuarioId}`;

function leerTerminada(usuarioId: string): boolean {
  try {
    return localStorage.getItem(claveTerminada(usuarioId)) === '1';
  } catch {
    return false;
  }
}

function guardarTerminada(usuarioId: string, terminada: boolean): void {
  try {
    if (terminada) localStorage.setItem(claveTerminada(usuarioId), '1');
    else localStorage.removeItem(claveTerminada(usuarioId));
  } catch {
    // Sin localStorage, solo cuenta el cambio que llegue a la cuenta.
  }
}

function leerGuardados(usuarioId: string): PasoGuia[] {
  try {
    const crudo = localStorage.getItem(clave(usuarioId));
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter(esPasoGuia) : [];
  } catch {
    return [];
  }
}

function guardar(usuarioId: string, vistos: PasoGuia[]): void {
  try {
    if (vistos.length === 0) localStorage.removeItem(clave(usuarioId));
    else localStorage.setItem(clave(usuarioId), JSON.stringify(vistos));
  } catch {
    // Sin localStorage la guía sigue funcionando en esta carga; solo no recuerda los pasos entre cargas.
  }
}

interface GuiaState {
  /** Pasos ya vistos por cuenta (se leen del navegador la primera vez que se piden). */
  vistos: Record<string, PasoGuia[]>;
  /**
   * Cuentas cuya guía se terminó o saltó en este navegador: se oculta al instante, sin esperar a que Supabase confirme el cambio
   * (y aunque la página se recargue antes de que llegue). Se recuerda en el navegador además de en la cuenta.
   */
  terminadas: Record<string, true>;
  marcar: (usuarioId: string, paso: PasoGuia) => void;
  terminar: (usuarioId: string) => void;
  reiniciar: (usuarioId: string) => void;
}

/** Qué pasos de la guía ya vio cada cuenta en este navegador, y cuáles guías se acaban de apagar. Ver lib/guia.ts. */
export const useGuiaStore = create<GuiaState>((set, get) => ({
  vistos: {},
  terminadas: {},
  marcar: (usuarioId, paso) => {
    const actuales = get().vistos[usuarioId] ?? leerGuardados(usuarioId);
    if (actuales.includes(paso)) return;
    const siguientes = [...actuales, paso];
    guardar(usuarioId, siguientes);
    set((estado) => ({ vistos: { ...estado.vistos, [usuarioId]: siguientes } }));
  },
  terminar: (usuarioId) => {
    guardarTerminada(usuarioId, true);
    set((estado) => ({ terminadas: { ...estado.terminadas, [usuarioId]: true } }));
  },
  reiniciar: (usuarioId) => {
    guardar(usuarioId, []);
    guardarTerminada(usuarioId, false);
    set((estado) => {
      const { [usuarioId]: _quitada, ...terminadas } = estado.terminadas;
      return { vistos: { ...estado.vistos, [usuarioId]: [] }, terminadas };
    });
  },
}));

export function guiaTerminadaAqui(usuarioId: string | undefined, terminadas: Record<string, true>): boolean {
  return usuarioId !== undefined && (terminadas[usuarioId] === true || leerTerminada(usuarioId));
}

export function pasosVistos(usuarioId: string | undefined, vistos: Record<string, PasoGuia[]>): PasoGuia[] {
  if (!usuarioId) return [];
  return vistos[usuarioId] ?? leerGuardados(usuarioId);
}
