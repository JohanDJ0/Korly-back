import { Lightbulb } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Boton } from '@/components/ui';
import { colores } from '@/lib/tema';

interface PasoDeGuiaProps {
  titulo?: string;
  texto: string;
  /** Lo que hace el botón principal ("Siguiente", "Entendido", "Terminar"...). */
  etiquetaPrincipal: string;
  onPrincipal: () => void;
  /** Segunda acción con su propio texto ("Ahora no"). */
  etiquetaSecundaria?: string;
  onSecundaria?: () => void;
  /** Sin esto no se ofrece "Saltar guía" (el último paso ya cierra por sí mismo). */
  onSaltar?: () => void;
}

/**
 * Un paso de la guía de primeros pasos (lib/guia.ts), igual que frontend/src/components/PasoDeGuia.tsx: un aviso en línea
 * pegado al elemento que explica (que la pantalla envuelve en `Resaltado`), no un globo flotante.
 */
export function PasoDeGuia({ titulo, texto, etiquetaPrincipal, onPrincipal, etiquetaSecundaria, onSecundaria, onSaltar }: PasoDeGuiaProps) {
  return (
    <View accessibilityLabel="Guía de Korly" style={{ borderWidth: 1, borderColor: 'rgba(254,184,22,0.6)', backgroundColor: 'rgba(254,184,22,0.1)', borderRadius: 16, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Lightbulb size={16} color="#146155" style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 4 }}>
          {titulo && <Text style={{ fontSize: 14, fontWeight: '700', color: colores.texto }}>{titulo}</Text>}
          <Text style={{ fontSize: 13, lineHeight: 19, color: colores.texto }}>{texto}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 26 }}>
        <Boton chico onPress={onPrincipal}>
          {etiquetaPrincipal}
        </Boton>
        {etiquetaSecundaria && onSecundaria && (
          <Boton chico variante="contorno" onPress={onSecundaria}>
            {etiquetaSecundaria}
          </Boton>
        )}
        {onSaltar && (
          <Boton chico variante="plano" onPress={onSaltar}>
            Saltar guía
          </Boton>
        )}
      </View>
    </View>
  );
}

/**
 * Lo que en la web es la clase `resaltado-guia`: un aro dorado alrededor del elemento que el paso activo explica, con una
 * onda que sale y se desvanece en bucle. Con "reducir movimiento" del teléfono queda solo el aro fijo. Inactivo, no
 * agrega nada (el hijo se pinta tal cual).
 */
export function Resaltado({ activo, radio = 16, children, style }: { activo: boolean; radio?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const onda = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activo) return;
    let animacion: Animated.CompositeAnimation | undefined;
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reducir) => {
      if (cancelado || reducir) return;
      animacion = Animated.loop(Animated.timing(onda, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      animacion.start();
    });
    return () => {
      cancelado = true;
      animacion?.stop();
      onda.setValue(0);
    };
  }, [activo, onda]);

  if (!activo) return <View style={style}>{children}</View>;

  const escala = onda.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const opacidad = onda.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.85, 0.4, 0] });

  return (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: radio + 6, borderWidth: 3, borderColor: colores.dorado, opacity: opacidad, transform: [{ scale: escala }] }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: radio + 6, borderWidth: 3, borderColor: colores.dorado }} />
      {children}
    </View>
  );
}
