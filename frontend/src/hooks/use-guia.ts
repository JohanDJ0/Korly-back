import { useCallback, useMemo } from 'react';

import { guiaActiva, type PasoGuia } from '@/lib/guia';
import { supabase } from '@/lib/supabase';
import { guiaTerminadaAqui, pasosVistos, useGuiaStore } from '@/stores/guia-store';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Estado de la guía de primeros pasos para la cuenta en sesión (ver lib/guia.ts). `terminar` la apaga en todos los
 * dispositivos (metadatos de la cuenta, como la constancia del aviso) y de inmediato en esta pantalla; `reiniciar`
 * la vuelve a encender desde cero ("Ver la guía otra vez" en Ajustes).
 */
export function useGuia() {
  const usuario = useAuthStore((s) => s.session?.user);
  const usuarioId = usuario?.id;
  const vistosPorCuenta = useGuiaStore((s) => s.vistos);
  const terminadas = useGuiaStore((s) => s.terminadas);
  const terminadaAhora = guiaTerminadaAqui(usuarioId, terminadas);
  const marcar = useGuiaStore((s) => s.marcar);
  const terminarLocal = useGuiaStore((s) => s.terminar);
  const reiniciarLocal = useGuiaStore((s) => s.reiniciar);

  const activa = !terminadaAhora && guiaActiva(usuario);
  const vistos = useMemo(() => new Set<PasoGuia>(pasosVistos(usuarioId, vistosPorCuenta)), [usuarioId, vistosPorCuenta]);

  const marcarVisto = useCallback(
    (paso: PasoGuia) => {
      if (usuarioId) marcar(usuarioId, paso);
    },
    [usuarioId, marcar]
  );

  const terminar = useCallback(async () => {
    if (!usuarioId) return;
    terminarLocal(usuarioId);
    // Si el cambio no se guarda (sin red), la guía vuelve a salir en otra sesión: molesto, no grave.
    await supabase.auth.updateUser({ data: { guia_terminada: true } }).catch(() => undefined);
  }, [usuarioId, terminarLocal]);

  const reiniciar = useCallback(async () => {
    if (!usuarioId) return;
    reiniciarLocal(usuarioId);
    await supabase.auth.updateUser({ data: { guia_terminada: false } });
  }, [usuarioId, reiniciarLocal]);

  return { activa, vistos, marcarVisto, terminar, reiniciar };
}
