// Copia de las versiones y la constancia de frontend/src/lib/datos-responsable.ts. DEBEN coincidir con la web: si la web
// sube una versión y la app no, la app pediría aceptar algo distinto. Fase 3: pasa a un paquete compartido.

export const VERSION_AVISO_PRIVACIDAD = '2026-10-10';
export const VERSION_TERMINOS = '2026-10-06';

export const URL_AVISO_PRIVACIDAD = 'https://app.korly.com.mx/privacidad';
export const URL_TERMINOS = 'https://app.korly.com.mx/terminos';

/** Metadatos del usuario de Supabase donde queda la constancia (los mismos que escribe la web). */
export function constanciaDeAviso() {
  return {
    aviso_privacidad_version: VERSION_AVISO_PRIVACIDAD,
    terminos_version: VERSION_TERMINOS,
    aviso_privacidad_aceptado_en: new Date().toISOString(),
  };
}

/** ¿Esta cuenta ya aceptó las versiones vigentes? Sin constancia cuenta como no (igual que la web). */
export function aceptoAvisoVigente(metadatos: Record<string, unknown> | undefined): boolean {
  return metadatos?.aviso_privacidad_version === VERSION_AVISO_PRIVACIDAD && metadatos?.terminos_version === VERSION_TERMINOS;
}
