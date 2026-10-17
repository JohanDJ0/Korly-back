import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Boton } from '@/components/ui';
import { ProveedorSesion, useSesion } from '@/hooks/use-sesion';
import { queryClient } from '@/lib/query-client';
import { colores } from '@/lib/tema';

/**
 * Con sesión solo existe la app (grupo `(app)`); sin sesión, las pantallas de acceso. `Stack.Protected` cambia solo cuando
 * Supabase avisa que la sesión empezó o terminó (también cuando la API responde que el token ya no sirve, ver lib/api.ts).
 */
function Navegacion() {
  const { session, cargando } = useSesion();

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.hero }}>
        <ActivityIndicator color={colores.dorado} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}>
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="login" />
        <Stack.Screen name="registro" />
        <Stack.Screen name="olvide-password" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Igual que el `Sentry.ErrorBoundary` de la web (frontend/src/main.tsx): un error de pantalla no deja la app en blanco,
 * sino un mensaje y la forma de reintentar. Expo Router usa este export de la ruta raíz para toda la app.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colores.fondo }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colores.texto }}>Algo salió mal</Text>
      <Text style={{ fontSize: 15, color: colores.textoTenue, textAlign: 'center' }}>Ocurrió un error inesperado. Puedes intentar de nuevo.</Text>
      <Boton onPress={() => void retry()}>Reintentar</Boton>
    </View>
  );
}

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ProveedorSesion>
          <StatusBar style="auto" />
          <Navegacion />
        </ProveedorSesion>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
