import { router } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colores } from '@/lib/tema';
import { usePrivacidadStore } from '@/stores/privacidad-store';

// Piezas visuales compartidas por todas las pantallas: el equivalente de components/ui de la web (Button, Card, Input...).

type VarianteBoton = 'primario' | 'contorno' | 'peligro' | 'plano' | 'dorado';

interface BotonProps {
  children: ReactNode;
  onPress: () => void;
  variante?: VarianteBoton;
  deshabilitado?: boolean;
  cargando?: boolean;
  chico?: boolean;
  icono?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const FONDO_BOTON: Record<VarianteBoton, string> = {
  primario: colores.primario,
  contorno: colores.tarjeta,
  peligro: colores.peligro,
  plano: 'transparent',
  dorado: colores.dorado,
};

const TEXTO_BOTON: Record<VarianteBoton, string> = {
  primario: colores.primarioTexto,
  contorno: colores.texto,
  peligro: '#ffffff',
  plano: colores.textoTenue,
  dorado: colores.doradoTexto,
};

export function Boton({ children, onPress, variante = 'primario', deshabilitado, cargando, chico, icono, style }: BotonProps) {
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.boton,
        chico && estilos.botonChico,
        { backgroundColor: FONDO_BOTON[variante] },
        variante === 'contorno' && estilos.botonContorno,
        (pressed || inactivo) && { opacity: inactivo ? 0.55 : 0.8 },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={TEXTO_BOTON[variante]} />
      ) : (
        <View style={estilos.botonContenido}>
          {icono}
          <Text style={[estilos.botonTexto, chico && { fontSize: 14 }, { color: TEXTO_BOTON[variante] }]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={estilos.titulo}>{children}</Text>;
}

export function TextoTenue({ children }: { children: ReactNode }) {
  return <Text style={estilos.tenue}>{children}</Text>;
}

export function TextoError({ children }: { children: ReactNode }) {
  return <Text style={estilos.error}>{children}</Text>;
}

interface CampoProps extends TextInputProps {
  etiqueta: string;
  error?: string;
  ayuda?: string;
}

export function Campo({ etiqueta, error, ayuda, style, ...props }: CampoProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput placeholderTextColor={colores.textoTenue} style={[estilos.input, error ? { borderColor: colores.peligro } : null, style]} {...props} />
      {ayuda && !error && <Text style={estilos.tenueChico}>{ayuda}</Text>}
      {error && <TextoError>{error}</TextoError>}
    </View>
  );
}

export function Chip({ texto, elegido, onPress, icono }: { texto: string; elegido: boolean; onPress: () => void; icono?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[estilos.chip, elegido && estilos.chipElegido]} accessibilityState={{ selected: elegido }}>
      {icono}
      <Text style={[estilos.chipTexto, elegido && { color: colores.primarioTexto }]}>{texto}</Text>
    </Pressable>
  );
}

export function Cargando() {
  return <ActivityIndicator color={colores.primario} size="large" style={{ marginVertical: 32 }} />;
}

/** Error al cargar algo, con un botón que lo vuelve a pedir (en el teléfono no hay "recargar la página"). */
export function ErrorConReintento({ mensaje, onReintentar, reintentando }: { mensaje: string; onReintentar: () => void; reintentando?: boolean }) {
  return (
    <View style={estilos.cajaError}>
      <TextoError>{mensaje}</TextoError>
      <Boton variante="contorno" chico onPress={onReintentar} cargando={reintentando} style={{ alignSelf: 'flex-start' }}>
        Reintentar
      </Boton>
    </View>
  );
}

/** El ojito: oculta o muestra todos los montos de la app. */
export function BotonOjito({ claro }: { claro?: boolean }) {
  const oculto = usePrivacidadStore((s) => s.oculto);
  const alternar = usePrivacidadStore((s) => s.alternar);
  const Icono = oculto ? EyeOff : Eye;
  return (
    <Pressable
      onPress={alternar}
      accessibilityRole="button"
      accessibilityLabel={oculto ? 'Mostrar montos' : 'Ocultar montos'}
      style={[estilos.botonRedondo, claro ? { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0 } : null]}
      hitSlop={6}
    >
      <Icono size={17} color={claro ? colores.heroTextoTenue : colores.textoTenue} />
    </Pressable>
  );
}

/** Encabezado de las pantallas secundarias: flecha para volver, título y (si hay montos) el ojito. */
export function Encabezado({ titulo, sinOjito, conVolver, accion }: { titulo: string; sinOjito?: boolean; conVolver?: boolean; accion?: ReactNode }) {
  return (
    <View style={estilos.encabezado}>
      {conVolver && (
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={estilos.botonRedondo} hitSlop={6}>
          <ArrowLeft size={16} color={colores.texto} />
        </Pressable>
      )}
      <Text style={estilos.encabezadoTitulo}>{titulo}</Text>
      {accion}
      {!sinOjito && <BotonOjito />}
    </View>
  );
}

/**
 * Contenedor con scroll de cada pantalla. Deslizar hacia abajo vuelve a pedir todo lo que la pantalla está mostrando (en el
 * teléfono no hay "recargar la página").
 */
export function Pantalla({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refrescando, setRefrescando] = useState(false);

  async function refrescar() {
    setRefrescando(true);
    await queryClient.refetchQueries({ type: 'active' }).catch(() => undefined);
    setRefrescando(false);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colores.fondo }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 14, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} colors={[colores.primario]} />}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Hoja que sube desde abajo para "nuevo X" (equivale a HojaInferior de la web). El botón atrás de Android y tocar fuera
 * la cierran.
 */
export function HojaInferior({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={estilos.fondoHoja} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[estilos.hoja, { paddingBottom: insets.bottom + 20 }]}>
          <View style={estilos.agarradera} />
          <View style={estilos.hojaEncabezado}>
            <Text style={estilos.hojaTitulo}>{titulo}</Text>
            <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar" style={estilos.cerrarHoja} hitSlop={8}>
              <X size={14} color={colores.texto} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Dos o tres opciones excluyentes en una sola fila (equivale al Segmentado de la web). */
export function Segmentado<T extends string>({ etiqueta, valor, opciones, onCambiar }: { etiqueta: string; valor: T; opciones: { valor: T; etiqueta: string }[]; onCambiar: (valor: T) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 4, backgroundColor: '#f2f2f2', borderRadius: 12, padding: 4 }}>
        {opciones.map((opcion) => {
          const elegida = valor === opcion.valor;
          return (
            <Pressable
              key={opcion.valor}
              accessibilityRole="radio"
              accessibilityState={{ checked: elegida }}
              onPress={() => onCambiar(opcion.valor)}
              style={{ flex: 1, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center', backgroundColor: elegida ? colores.tarjeta : 'transparent' }}
            >
              <Text style={{ fontSize: 13, fontWeight: elegida ? '700' : '500', color: elegida ? colores.texto : colores.textoTenue, textAlign: 'center' }}>{opcion.etiqueta}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Confirmación de una acción que borra o cierra algo. Usa el diálogo nativo de Android (en la web era una confirmación
 * dentro de la página porque window.confirm fallaba en silencio en algunos navegadores; aquí el nativo es confiable).
 */
export function confirmar(pregunta: string, textoConfirmar: string, onConfirmar: () => void, detalle?: string) {
  Alert.alert(pregunta, detalle, [
    { text: 'Cancelar', style: 'cancel' },
    { text: textoConfirmar, style: 'destructive', onPress: onConfirmar },
  ]);
}

export const estilos = StyleSheet.create({
  boton: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  botonChico: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12 },
  botonContorno: { borderWidth: 1, borderColor: colores.borde },
  botonContenido: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  botonTexto: { fontSize: 15.5, fontWeight: '700' },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: colores.borde },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  tenue: { fontSize: 14, color: colores.textoTenue, lineHeight: 20 },
  tenueChico: { fontSize: 12.5, color: colores.textoTenue },
  error: { color: colores.peligro, fontSize: 14 },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto },
  input: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.tarjeta,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colores.borde, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colores.tarjeta },
  chipElegido: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { color: colores.texto, fontSize: 14 },
  cajaError: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 16, padding: 16, gap: 10 },
  botonRedondo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 4 },
  encabezadoTitulo: { flex: 1, fontSize: 20, fontWeight: '700', color: colores.texto },
  fondoHoja: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  hoja: { backgroundColor: colores.tarjeta, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 16, maxHeight: '90%' },
  agarradera: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e5e5' },
  hojaEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hojaTitulo: { fontSize: 18, fontWeight: '700', color: colores.texto },
  cerrarHoja: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
});
