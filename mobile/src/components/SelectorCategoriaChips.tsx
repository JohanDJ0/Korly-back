import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Boton, Chip, estilos, TextoError } from '@/components/ui';
import { useCategorias } from '@/hooks/use-categorias';
import { useCrearCategoria } from '@/hooks/use-crear-categoria';
import { iconoCategoria } from '@/lib/icono-categoria';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/components/SelectorCategoriaChips.tsx: la categoría es opcional (tocar la elegida la quita) y
 * se puede crear una nueva sin salir del formulario. `value` '' = sin categoría.
 */
export function SelectorCategoriaChips({ value, onChange }: { value: string; onChange: (categoriaId: string) => void }) {
  const { data: categorias } = useCategorias();
  const crearCategoria = useCrearCategoria();
  const [creando, setCreando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState('');

  function confirmarNueva() {
    const nombre = nombreNueva.trim();
    if (nombre.length === 0) return;
    crearCategoria.mutate(
      { nombre },
      {
        onSuccess: (nueva) => {
          onChange(nueva.id);
          setCreando(false);
          setNombreNueva('');
        },
      }
    );
  }

  if (creando) {
    return (
      <View style={{ gap: 8 }}>
        <TextInput value={nombreNueva} onChangeText={setNombreNueva} placeholder="Nombre de la categoría" autoFocus style={estilos.input} placeholderTextColor={colores.textoTenue} onSubmitEditing={confirmarNueva} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Boton chico onPress={confirmarNueva} cargando={crearCategoria.isPending}>
            Crear
          </Boton>
          <Boton
            chico
            variante="plano"
            onPress={() => {
              crearCategoria.reset();
              setCreando(false);
              setNombreNueva('');
            }}
          >
            Cancelar
          </Boton>
        </View>
        {crearCategoria.isError && <TextoError>{crearCategoria.error.message}</TextoError>}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {categorias?.map((categoria) => {
          const Icono = iconoCategoria(categoria.nombre, categoria.icono);
          const seleccionada = value === categoria.id;
          return (
            <Chip
              key={categoria.id}
              texto={categoria.nombre}
              elegido={seleccionada}
              onPress={() => onChange(seleccionada ? '' : categoria.id)}
              icono={<Icono size={15} color={seleccionada ? colores.primarioTexto : colores.texto} />}
            />
          );
        })}
      </ScrollView>
      <Pressable onPress={() => setCreando(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button">
        <Plus size={13} color={colores.primario} strokeWidth={2.5} />
        <Text style={{ color: colores.primario, fontWeight: '700', fontSize: 13 }}>Nueva categoría</Text>
      </Pressable>
    </View>
  );
}
