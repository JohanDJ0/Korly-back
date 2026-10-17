import { Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Boton, Campo, Cargando, confirmar, Encabezado, estilos as ui, HojaInferior, Pantalla, Tarjeta, TextoError } from '@/components/ui';
import { useActualizarCategoria } from '@/hooks/use-actualizar-categoria';
import { useCategorias, type Categoria } from '@/hooks/use-categorias';
import { useCrearCategoria } from '@/hooks/use-crear-categoria';
import { useEliminarCategoria } from '@/hooks/use-eliminar-categoria';
import { ICONOS_CATEGORIA, iconoCategoria } from '@/lib/icono-categoria';
import { colores } from '@/lib/tema';

/** Igual que frontend/src/routes/Categorias.tsx: verlas todas, crear (con ícono opcional), renombrar y eliminar. */
export default function Categorias() {
  const { data: categorias, isLoading, error } = useCategorias();
  const crearCategoria = useCrearCategoria();
  const [nombreNueva, setNombreNueva] = useState('');
  // '' = sin ícono elegido: cae al emparejamiento por palabra clave de siempre.
  const [iconoNuevo, setIconoNuevo] = useState('');

  function crear() {
    const nombre = nombreNueva.trim();
    if (nombre.length === 0) return;
    crearCategoria.mutate({ nombre, icono: iconoNuevo || undefined }, { onSuccess: () => (setNombreNueva(''), setIconoNuevo('')) });
  }

  return (
    <Pantalla>
      <Encabezado titulo="Categorías" sinOjito conVolver />
      {isLoading && <Cargando />}
      {error && <TextoError>{error.message}</TextoError>}
      {categorias?.map((categoria) => (
        <FilaCategoria key={categoria.id} categoria={categoria} />
      ))}
      <Tarjeta>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 }}>NUEVA CATEGORÍA</Text>
        <TextInput value={nombreNueva} onChangeText={setNombreNueva} onSubmitEditing={crear} placeholder="Nombre de la categoría" placeholderTextColor={colores.textoTenue} style={ui.input} />
        <IconoPicker value={iconoNuevo || null} onChange={setIconoNuevo} />
        <Boton onPress={crear} cargando={crearCategoria.isPending} icono={<Plus size={16} color={colores.primarioTexto} strokeWidth={2.5} />}>
          Crear categoría
        </Boton>
        {crearCategoria.isError && <TextoError>{crearCategoria.error.message}</TextoError>}
      </Tarjeta>
    </Pantalla>
  );
}

/** Las predeterminadas no se pueden eliminar (el backend lo rechaza), pero nombre e ícono sí se cambian en todas. */
function FilaCategoria({ categoria }: { categoria: Categoria }) {
  const eliminarCategoria = useEliminarCategoria();
  const actualizarCategoria = useActualizarCategoria();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(categoria.nombre);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const Icono = iconoCategoria(categoria.nombre, categoria.icono);

  function abrir() {
    setNombre(categoria.nombre);
    setErrorValidacion(null);
    actualizarCategoria.reset();
    setEditando(true);
  }

  function guardarNombre() {
    const limpio = nombre.trim();
    if (limpio.length === 0) return setErrorValidacion('El nombre no puede estar vacío');
    setErrorValidacion(null);
    if (limpio !== categoria.nombre) actualizarCategoria.mutate({ categoriaId: categoria.id, nombre: limpio }, { onSuccess: () => setEditando(false) });
    else setEditando(false);
  }

  return (
    <Tarjeta style={{ padding: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={abrir} accessibilityLabel={`Editar ${categoria.nombre}`} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' }}>
          <Icono size={16} color="#146155" />
        </Pressable>
        <Pressable onPress={abrir} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '500', color: colores.texto, flexShrink: 1 }} numberOfLines={1}>
            {categoria.nombre}
          </Text>
          <Pencil size={12} color={colores.textoTenue} />
        </Pressable>
        {categoria.esPredeterminada ? (
          <Text style={{ fontSize: 12, color: colores.textoTenue }}>Predeterminada</Text>
        ) : (
          <Pressable onPress={() => confirmar(`¿Eliminar la categoría "${categoria.nombre}"?`, 'Eliminar', () => eliminarCategoria.mutate(categoria.id))} disabled={eliminarCategoria.isPending} hitSlop={6}>
            <Text style={{ fontSize: 13, color: colores.peligro, fontWeight: '600' }}>Eliminar</Text>
          </Pressable>
        )}
      </View>
      {eliminarCategoria.isError && <TextoError>{eliminarCategoria.error.message}</TextoError>}
      {!editando && actualizarCategoria.isError && <TextoError>{actualizarCategoria.error.message}</TextoError>}

      {editando && (
        <HojaInferior titulo="Editar categoría" onCerrar={() => setEditando(false)}>
          <Campo etiqueta="Nombre" value={nombre} onChangeText={(t) => (setNombre(t), setErrorValidacion(null))} onSubmitEditing={guardarNombre} autoFocus />
          <Text style={ui.etiqueta}>Ícono</Text>
          <IconoPicker value={categoria.icono} onChange={(clave) => actualizarCategoria.mutate({ categoriaId: categoria.id, icono: clave })} />
          {(errorValidacion ?? actualizarCategoria.error?.message) && <TextoError>{errorValidacion ?? actualizarCategoria.error?.message}</TextoError>}
          <Boton onPress={guardarNombre} cargando={actualizarCategoria.isPending}>
            Listo
          </Boton>
        </HojaInferior>
      )}
    </Tarjeta>
  );
}

/** Cuadrícula del set fijo de íconos de categoría (lib/icono-categoria.tsx). */
function IconoPicker({ value, onChange }: { value: string | null; onChange: (clave: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ICONOS_CATEGORIA.map(({ clave, etiqueta, Icono }) => {
        const seleccionado = value === clave;
        return (
          <Pressable
            key={clave}
            accessibilityLabel={etiqueta}
            accessibilityState={{ selected: seleccionado }}
            onPress={() => onChange(clave)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: seleccionado ? colores.primario : colores.borde,
              backgroundColor: seleccionado ? colores.primario : colores.tarjeta,
            }}
          >
            <Icono size={17} color={seleccionado ? colores.primarioTexto : colores.texto} />
          </Pressable>
        );
      })}
    </View>
  );
}
