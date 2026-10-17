import { Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Boton, Campo, TextoError } from '@/components/ui';
import { useCrearAtajo } from '@/hooks/use-crear-atajo';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/components/GuardarComoAtajo.tsx: toma el monto y la categoría del formulario y solo pide el nombre.
 * No registra el gasto. Los errores del servidor (límite del plan, nombre repetido) se muestran tal cual. `onGuardado` lo usa la
 * guía para dar su pista por leída.
 */
export function GuardarComoAtajo({ centavos, categoriaId, nombreSugerido, onGuardado }: { centavos: number; categoriaId: string; nombreSugerido: string; onGuardado?: () => void }) {
  const crearAtajo = useCrearAtajo();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardado, setGuardado] = useState<string | null>(null);

  function abrir() {
    crearAtajo.reset();
    setGuardado(null);
    setNombre(nombreSugerido.trim().slice(0, 30));
    setAbierto(true);
  }

  function guardar() {
    const limpio = nombre.trim();
    if (limpio.length === 0) return;
    crearAtajo.mutate(
      { nombre: limpio, monto: { valorMinimo: centavos, moneda: 'MXN' }, categoriaId: categoriaId || undefined },
      {
        onSuccess: (atajo) => {
          setGuardado(atajo.nombre);
          setAbierto(false);
          onGuardado?.();
        },
      }
    );
  }

  if (abierto) {
    return (
      <View style={{ gap: 10, borderWidth: 1, borderColor: colores.borde, borderRadius: 16, padding: 14 }}>
        <Campo etiqueta="Nombre del atajo" value={nombre} onChangeText={setNombre} maxLength={30} placeholder="p. ej. Café" autoFocus onSubmitEditing={guardar} />
        {crearAtajo.isError && <TextoError>{crearAtajo.error.message}</TextoError>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Boton chico onPress={guardar} cargando={crearAtajo.isPending} deshabilitado={nombre.trim().length === 0}>
            Guardar atajo
          </Boton>
          <Boton chico variante="plano" onPress={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </View>
      </View>
    );
  }

  if (guardado) {
    return <Text style={{ textAlign: 'center', color: colores.textoTenue, fontSize: 12.5 }}>Atajo “{guardado}” guardado: lo verás en Inicio.</Text>;
  }

  return (
    <Pressable onPress={abrir} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center' }} accessibilityRole="button">
      <Zap size={13} color={colores.primario} strokeWidth={2.5} />
      <Text style={{ color: colores.primario, fontWeight: '700', fontSize: 13 }}>Guardar como atajo</Text>
    </Pressable>
  );
}
