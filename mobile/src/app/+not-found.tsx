import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Boton } from '@/components/ui';
import { colores } from '@/lib/tema';

/** Equivale a frontend/src/routes/NoEncontrado.tsx: un enlace que no lleva a ninguna pantalla de la app. */
export default function NoEncontrado() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colores.fondo }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colores.texto }}>Pantalla no encontrada</Text>
      <Text style={{ fontSize: 15, color: colores.textoTenue, textAlign: 'center' }}>La dirección a la que intentas entrar no existe.</Text>
      <Boton onPress={() => router.replace('/')}>Volver al inicio</Boton>
    </View>
  );
}
