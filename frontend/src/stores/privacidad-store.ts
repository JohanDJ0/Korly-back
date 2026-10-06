import { create } from 'zustand';

const CLAVE = 'korly:ocultar-montos';

/** El almacenamiento puede faltar o lanzar (ventana privada, datos del sitio bloqueados): sin él, la app funciona igual, solo que no recuerda la elección. */
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
    // Ver `leerGuardado`.
  }
}

interface PrivacidadState {
  /** true = todas las cifras de dinero se muestran enmascaradas (el "ojito"). */
  oculto: boolean;
  alternar: () => void;
}

/**
 * Privacidad visual para usar Korly en público: una sola llave que enmascara todos los montos de la app
 * (ver `useFormatearMonto`). Se recuerda en este dispositivo y por defecto los montos se ven. No es seguridad:
 * no protege los datos, solo evita que alguien mire la pantalla por encima del hombro.
 */
export const usePrivacidadStore = create<PrivacidadState>((set, get) => ({
  oculto: leerGuardado(),
  alternar: () => {
    const oculto = !get().oculto;
    guardar(oculto);
    set({ oculto });
  },
}));
