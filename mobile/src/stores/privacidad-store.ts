import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';

// Igual que frontend/src/stores/privacidad-store.ts; el `localStorage` aquí lo instala expo-sqlite (persiste en el teléfono).
const CLAVE = 'korly:ocultar-montos';

function leerGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

function guardar(oculto: boolean): void {
  try {
    localStorage.setItem(CLAVE, oculto ? '1' : '0');
  } catch {
    // Sin almacenamiento la app funciona igual, solo no recuerda la elección.
  }
}

interface PrivacidadState {
  /** true = todas las cifras de dinero se muestran enmascaradas (el "ojito"). */
  oculto: boolean;
  alternar: () => void;
}

/** El ojito: una sola llave que enmascara todos los montos (ver `useFormatearMonto`). No es seguridad, es privacidad visual. */
export const usePrivacidadStore = create<PrivacidadState>((set, get) => ({
  oculto: leerGuardado(),
  alternar: () => {
    const oculto = !get().oculto;
    guardar(oculto);
    set({ oculto });
  },
}));
