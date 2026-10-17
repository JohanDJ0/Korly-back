import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProveedorSesion, useSesion } from '@/hooks/use-sesion';
import { queryClient } from '@/lib/query-client';
import { colores } from '@/lib/tema';

/**
 * Con sesión solo existe Inicio; sin sesión solo existe Iniciar sesión. `Stack.Protected` hace el cambio solo cuando
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
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
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
