import { Stack } from 'expo-router';

import { ReaceptarAviso } from '@/components/ReaceptarAviso';
import { useSesion } from '@/hooks/use-sesion';
import { aceptoAvisoVigente } from '@/lib/aviso';
import { colores } from '@/lib/tema';

/**
 * Todo lo que requiere sesión. Igual que ProtectedRoute de la web: si la cuenta no aceptó la versión vigente del aviso y
 * los términos, no entra hasta aceptarla. Las pestañas viven en `(tabs)`; el resto son pantallas que se abren encima.
 */
export default function LayoutApp() {
  const { session } = useSesion();
  if (!aceptoAvisoVigente(session?.user.user_metadata)) return <ReaceptarAviso />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }} />;
}
