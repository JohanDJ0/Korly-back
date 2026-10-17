import { useLocalSearchParams } from 'expo-router';

import { VistaHistorial } from '@/components/VistaHistorial';

/** Historial de una quincena anterior (desde "Periodos anteriores"). */
export default function HistorialDePeriodo() {
  const { periodoId } = useLocalSearchParams<{ periodoId: string }>();
  return <VistaHistorial periodoIdDeRuta={periodoId} />;
}
