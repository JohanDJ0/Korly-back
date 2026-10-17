import { useCallback, useMemo } from 'react';

import { useSesion } from '@/hooks/use-sesion';
import { guiaActiva, type PasoGuia } from '@/lib/guia';
import { supabase } from '@/lib/supabase';
import { guiaTerminadaAqui, pasosVistos, useGuiaStore } from '@/stores/guia-store';

/**
 * Igual que frontend/src/hooks/use-guia.ts (solo cambia de dónde sale la sesión). `terminar` la apaga en todos los
 * dispositivos (metadatos de la cuenta) y de inmediato aquí; `reiniciar` la vuelve a encender desde cero ("Ver la guía
 * otra vez" en Más). Qué pasos ya se vieron se recuerda en el teléfono, por cuenta.
 */
export function useGuia() {
  const { session } = useSesion();
  const usuario = session?.user;
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
