import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colores } from '@/lib/tema';

// Piezas de las pantallas de acceso (iniciar sesión, registro, olvidé mi contraseña): el mismo fondo verde oscuro y el
// botón dorado del rediseño de la web (AuthCard y BotonAuth).

export function PantallaAcceso({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.marca}>Korly</Text>
          <Text style={estilos.titulo}>{titulo}</Text>
          {descripcion && <Text style={estilos.descripcion}>{descripcion}</Text>}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CampoAcceso({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput autoCapitalize="none" placeholderTextColor={colores.heroTextoTenue} style={[estilos.input, error ? { borderColor: colores.heroRojo } : null]} {...props} />
      {error && <ErrorAcceso>{error}</ErrorAcceso>}
    </View>
  );
}

export function ErrorAcceso({ children }: { children: ReactNode }) {
  return <Text style={{ color: colores.heroRojo, fontSize: 14 }}>{children}</Text>;
}

export function BotonAcceso({ children, onPress, cargando, variante = 'dorado' }: { children: string; onPress: () => void; cargando?: boolean; variante?: 'dorado' | 'plano' }) {
  const dorado = variante === 'dorado';
  return (
    <Pressable onPress={onPress} disabled={cargando} accessibilityRole="button" style={({ pressed }) => [estilos.boton, !dorado && estilos.botonPlano, (pressed || cargando) && { opacity: 0.8 }]}>
      {cargando ? <ActivityIndicator color={dorado ? colores.doradoTexto : colores.heroTexto} /> : <Text style={[estilos.botonTexto, !dorado && { color: colores.heroTexto }]}>{children}</Text>}
    </Pressable>
  );
}

export function EnlaceAcceso({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={estilos.enlace}>{children}</Text>
    </Pressable>
  );
}

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LONGITUD_MINIMA_PASSWORD = 8;

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.hero },
  contenido: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  marca: { color: colores.dorado, fontSize: 22, fontWeight: '800' },
  titulo: { color: colores.heroTexto, fontSize: 26, fontWeight: '800', marginTop: 8 },
  descripcion: { color: colores.heroTextoTenue, fontSize: 15, marginBottom: 8 },
  etiqueta: { color: colores.heroTexto, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#0b1614',
    color: colores.heroTexto,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  boton: { backgroundColor: colores.dorado, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  botonPlano: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  botonTexto: { color: colores.doradoTexto, fontSize: 16, fontWeight: '800' },
  enlace: { color: colores.heroTextoTenue, textAlign: 'center', fontSize: 14, paddingVertical: 4 },
});
