import { useMutation } from '@tanstack/react-query';

import { descargarArchivo } from '@/lib/api';

/** Derecho de acceso (ARCO): descarga todo lo que Korly guarda del usuario. Gratis en todos los planes. */
export function useDescargarDatos() {
  return useMutation({
    mutationFn: () => descargarArchivo('/cuenta/datos', 'korly-mis-datos.json'),
  });
}
