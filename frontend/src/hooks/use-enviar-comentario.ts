import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

export type TipoDeComentario = 'problema' | 'idea' | 'otro';

export interface Comentario {
  tipo: TipoDeComentario;
  mensaje: string;
  /** Ruta de la app donde estaba la persona (p. ej. `/historial`). Nunca lleva montos ni datos. */
  pantalla: string;
  /** Solo si la persona marcó la casilla: entonces el correo de su cuenta llega como "responder a". */
  responder: boolean;
}

/** Manda un comentario al equipo (llega por correo a soporte; no se guarda en la base). */
export function useEnviarComentario() {
  return useMutation({
    mutationFn: (comentario: Comentario) => apiFetch<void>('/comentarios', { method: 'POST', body: JSON.stringify(comentario) }),
  });
}
