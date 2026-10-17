import { Pencil, Plus, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { Boton, Campo, Cargando, confirmar, Encabezado, HojaInferior, Pantalla, Tarjeta, TextoError, TextoTenue } from '@/components/ui';
import { useActualizarAtajo } from '@/hooks/use-actualizar-atajo';
import { useAtajos, type Atajo } from '@/hooks/use-atajos';
import { useCategorias } from '@/hooks/use-categorias';
import { useCrearAtajo } from '@/hooks/use-crear-atajo';
import { useEliminarAtajo } from '@/hooks/use-eliminar-atajo';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { pesosACentavos } from '@/lib/dinero';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/routes/Atajos.tsx. Cada atajo aparece en Inicio como un botón que registra el gasto de hoy con
 * un toque. Al llegar al límite del plan (Free 3, Pro 12) "Nuevo atajo" se apaga y se dice por qué.
 */
export default function Atajos() {
  const { data, isLoading, error } = useAtajos();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const llegoAlLimite = data !== undefined && data.atajos.length >= data.limite;

  return (
    <>
      <Pantalla>
        <Encabezado titulo="Atajos de gasto" conVolver />
        <TextoTenue>
          Gastos que repites, a un toque desde Inicio: el café, el camión, la comida del día.
          {data && ` Llevas ${data.atajos.length} de ${data.limite}.`}
        </TextoTenue>
        {isLoading && <Cargando />}
        {error && <TextoError>{error.message}</TextoError>}
        {data?.atajos.length === 0 && <TextoTenue>Todavía no tienes ningún atajo. Crea el primero con “Nuevo atajo”.</TextoTenue>}
        {data?.atajos.map((atajo) => (
          <FilaAtajo key={atajo.id} atajo={atajo} />
        ))}
        {llegoAlLimite && <TextoTenue>Llegaste al límite de atajos de tu plan. Elimina uno para crear otro.</TextoTenue>}
        <Boton onPress={() => setMostrarFormulario(true)} deshabilitado={!data || llegoAlLimite} icono={<Plus size={17} color={colores.primarioTexto} strokeWidth={2.5} />}>
          Nuevo atajo
        </Boton>
      </Pantalla>

      {mostrarFormulario && (
        <HojaInferior titulo="Nuevo atajo" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioAtajo onGuardado={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </>
  );
}

function FilaAtajo({ atajo }: { atajo: Atajo }) {
  const formatearMonto = useFormatearMonto();
  const { data: categorias } = useCategorias();
  const eliminarAtajo = useEliminarAtajo();
  const [editando, setEditando] = useState(false);
  const categoria = categorias?.find((c) => c.id === atajo.categoriaId);

  return (
    <Tarjeta style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={17} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: colores.texto }} numberOfLines={1}>
            {atajo.nombre}
          </Text>
          <Text style={{ fontSize: 12.5, color: colores.textoTenue }}>
            {formatearMonto(atajo.monto)}
            {categoria ? ` — ${categoria.nombre}` : ''}
          </Text>
        </View>
        <Boton chico variante="contorno" onPress={() => setEditando(true)} icono={<Pencil size={14} color={colores.texto} />}>
          Editar
        </Boton>
      </View>
      <Pressable onPress={() => confirmar(`¿Eliminar el atajo "${atajo.nombre}"?`, 'Eliminar', () => eliminarAtajo.mutate(atajo.id))} disabled={eliminarAtajo.isPending} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={{ fontSize: 13, color: colores.textoTenue }}>Eliminar</Text>
      </Pressable>
      {eliminarAtajo.isError && <TextoError>{eliminarAtajo.error.message}</TextoError>}
      {editando && (
        <HojaInferior titulo="Editar atajo" onCerrar={() => setEditando(false)}>
          <FormularioAtajo atajo={atajo} onGuardado={() => setEditando(false)} />
        </HojaInferior>
      )}
    </Tarjeta>
  );
}

/** Crear o editar un atajo. El monto se escribe en pesos, como en el formulario de gasto. */
function FormularioAtajo({ atajo, onGuardado }: { atajo?: Atajo; onGuardado: () => void }) {
  const crearAtajo = useCrearAtajo();
  const actualizarAtajo = useActualizarAtajo();
  const mutacion = atajo ? actualizarAtajo : crearAtajo;
  const [nombre, setNombre] = useState(atajo?.nombre ?? '');
  const [monto, setMonto] = useState(atajo ? String(atajo.monto.valorMinimo / 100) : '');
  const [categoriaId, setCategoriaId] = useState(atajo?.categoriaId ?? '');
  const [errores, setErrores] = useState<{ nombre?: string; monto?: string }>({});

  function guardar() {
    const centavos = pesosACentavos(monto);
    const limpio = nombre.trim();
    const nuevos = {
      nombre: limpio.length === 0 ? "Ponle un nombre (p. ej. 'Café')" : limpio.length > 30 ? 'Máximo 30 caracteres' : undefined,
      monto: centavos === null ? 'El monto debe ser mayor a cero' : undefined,
    };
    setErrores(nuevos);
    if (nuevos.nombre || centavos === null) return;
    const montoDto = { valorMinimo: centavos, moneda: 'MXN' };
    if (atajo) actualizarAtajo.mutate({ atajoId: atajo.id, nombre: limpio, monto: montoDto, categoriaId: categoriaId || null }, { onSuccess: onGuardado });
    else crearAtajo.mutate({ nombre: limpio, monto: montoDto, categoriaId: categoriaId || undefined }, { onSuccess: onGuardado });
  }

  return (
    <>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Café, camión, comida…" maxLength={30} autoFocus error={errores.nombre} />
      <Campo etiqueta="Monto" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" error={errores.monto} />
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 }}>CATEGORÍA (OPCIONAL)</Text>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </View>
      {mutacion.isError && <TextoError>{mutacion.error.message}</TextoError>}
      <Boton onPress={guardar} cargando={mutacion.isPending}>
        Guardar
      </Boton>
    </>
  );
}
