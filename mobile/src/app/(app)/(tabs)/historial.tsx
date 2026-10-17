import { useLocalSearchParams } from 'expo-router';

import { VistaHistorial } from '@/components/VistaHistorial';

/** Historial de la quincena activa. `?desglose=1` (el "Ver desglose →" de Inicio) lo abre con el desglose a la vista. */
export default function Historial() {
  const { desglose } = useLocalSearchParams<{ desglose?: string }>();
  return <VistaHistorial key={desglose ?? 'normal'} desgloseAbierto={desglose === '1'} />;
}
