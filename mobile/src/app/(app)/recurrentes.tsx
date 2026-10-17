import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { Boton, Campo, Cargando, confirmar, Encabezado, HojaInferior, Pantalla, Segmentado, Tarjeta, TextoError, TextoTenue } from '@/components/ui';
import { useActualizarRecurrente } from '@/hooks/use-actualizar-recurrente';
import { useCrearRecurrente } from '@/hooks/use-crear-recurrente';
import { useEliminarRecurrente } from '@/hooks/use-eliminar-recurrente';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useRecurrentes, type FrecuenciaRecurrente, type GastoRecurrente } from '@/hooks/use-recurrentes';
import { pesosACentavos } from '@/lib/dinero';
import { iconoCategoria } from '@/lib/icono-categoria';
import { colores } from '@/lib/tema';

/** Igual que frontend/src/routes/Recurrentes.tsx: ver, crear y pausar recurrentes no depende de tener quincena activa. */
export default function Recurrentes() {
  const { data: recurrentes, isLoading, error } = useRecurrentes();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <>
      <Pantalla>
        <Encabezado titulo="Gastos recurrentes" conVolver />
        <TextoTenue>Se aplican solos cuando toca — no hace falta capturarlos a mano.</TextoTenue>
        {isLoading && <Cargando />}
        {error && <TextoError>{error.message}</TextoError>}
        {recurrentes?.length === 0 && <TextoTenue>Todavía no tienes ninguna suscripción o gasto recurrente registrado.</TextoTenue>}
        {recurrentes?.map((recurrente) => (
          <FilaRecurrente key={recurrente.id} recurrente={recurrente} />
        ))}
        <Boton onPress={() => setMostrarFormulario(true)} icono={<Plus size={17} color={colores.primarioTexto} strokeWidth={2.5} />}>
          Nuevo gasto recurrente
        </Boton>
      </Pantalla>

      {mostrarFormulario && (
        <HojaInferior titulo="Nuevo gasto recurrente" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioRecurrente onCreado={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </>
  );
}

const etiquetaFrecuencia = (r: GastoRecurrente) => (r.frecuencia === 'quincenal' ? 'Cada quincena' : `Mensual, día ${r.diaMes}`);

/**
 * Igual que frontend/src/components/FilaRecurrente.tsx: editar (aplica desde el próximo cobro), pausar/reanudar y eliminar
 * (deja de cobrarse y de listarse; lo ya cobrado se queda en el historial).
 */
function FilaRecurrente({ recurrente }: { recurrente: GastoRecurrente }) {
  const formatearMonto = useFormatearMonto();
  const actualizarRecurrente = useActualizarRecurrente();
  const eliminarRecurrente = useEliminarRecurrente();
  const [editando, setEditando] = useState(false);
  const Icono = iconoCategoria(recurrente.descripcion);
  const error = actualizarRecurrente.error ?? eliminarRecurrente.error;

  return (
    <Tarjeta style={{ padding: 14, gap: 8, opacity: recurrente.activo ? 1 : 0.55 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' }}>
          <Icono size={17} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: colores.texto }}>{recurrente.descripcion}</Text>
          <Text style={{ fontSize: 12.5, color: colores.textoTenue }}>
            {formatearMonto(recurrente.monto)} — {etiquetaFrecuencia(recurrente)}
            {!recurrente.activo ? ' — Pausado' : ''}
          </Text>
        </View>
      </View>
      {error && <TextoError>{error.message}</TextoError>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Boton chico variante="contorno" style={{ flex: 1 }} onPress={() => setEditando(true)}>
          Editar
        </Boton>
        <Boton
          chico
          variante={recurrente.activo ? 'contorno' : 'primario'}
          style={{ flex: 1 }}
          cargando={actualizarRecurrente.isPending}
          onPress={() => actualizarRecurrente.mutate({ recurrenteId: recurrente.id, activo: !recurrente.activo })}
        >
          {recurrente.activo ? 'Pausar' : 'Reanudar'}
        </Boton>
      </View>
      <Pressable
        onPress={() =>
          confirmar(`¿Eliminar "${recurrente.descripcion}"?`, 'Eliminar', () => eliminarRecurrente.mutate(recurrente.id), 'Ya no se cobrará en las siguientes quincenas. Lo que ya se cobró se queda en tu historial.')
        }
        disabled={eliminarRecurrente.isPending}
        style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 13, color: colores.peligro, fontWeight: '600' }}>Eliminar</Text>
      </Pressable>
      {editando && (
        <HojaInferior titulo="Editar gasto recurrente" onCerrar={() => setEditando(false)}>
          <FormularioRecurrente recurrente={recurrente} onCreado={() => setEditando(false)} />
        </HojaInferior>
      )}
    </Tarjeta>
  );
}

const MENSAJE_DIA = 'Indica el día del mes en que se cobra (de 1 a 31)';

/** Crear o editar (con `recurrente`, todo precargado). Editar aplica desde el próximo cobro; lo ya cobrado no cambia. */
function FormularioRecurrente({ recurrente, onCreado }: { recurrente?: GastoRecurrente; onCreado: () => void }) {
  const crearRecurrente = useCrearRecurrente();
  const actualizarRecurrente = useActualizarRecurrente();
  const mutacion = recurrente ? actualizarRecurrente : crearRecurrente;
  const [descripcion, setDescripcion] = useState(recurrente?.descripcion ?? '');
  const [monto, setMonto] = useState(recurrente ? String(recurrente.monto.valorMinimo / 100) : '');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrente>(recurrente?.frecuencia ?? 'quincenal');
  const [diaMes, setDiaMes] = useState(recurrente?.diaMes ? String(recurrente.diaMes) : '');
  const [categoriaId, setCategoriaId] = useState(recurrente?.categoriaId ?? '');
  const [errores, setErrores] = useState<{ descripcion?: string; monto?: string; diaMes?: string }>({});

  function guardar() {
    const centavos = pesosACentavos(monto);
    const dia = Number(diaMes);
    const nuevos = {
      descripcion: descripcion.trim().length === 0 ? "Ponle un nombre (p. ej. 'Netflix')" : undefined,
      monto: centavos === null ? 'El monto debe ser mayor a cero' : undefined,
      diaMes: frecuencia === 'mensual' && (!Number.isInteger(dia) || dia < 1 || dia > 31) ? MENSAJE_DIA : undefined,
    };
    setErrores(nuevos);
    if (Object.values(nuevos).some(Boolean) || centavos === null) return;
    if (recurrente) {
      actualizarRecurrente.mutate(
        {
          recurrenteId: recurrente.id,
          descripcion: descripcion.trim(),
          monto: { valorMinimo: centavos, moneda: recurrente.monto.moneda },
          frecuencia,
          diaMes: frecuencia === 'mensual' ? dia : null,
          categoriaId: categoriaId || null,
        },
        { onSuccess: onCreado }
      );
      return;
    }
    crearRecurrente.mutate(
      { descripcion: descripcion.trim(), monto: { valorMinimo: centavos, moneda: 'MXN' }, frecuencia, diaMes: frecuencia === 'mensual' ? dia : undefined, categoriaId: categoriaId || undefined },
      { onSuccess: onCreado }
    );
  }

  return (
    <>
      <Campo etiqueta="Descripción" value={descripcion} onChangeText={setDescripcion} placeholder="Netflix, renta, gimnasio…" autoFocus error={errores.descripcion} />
      <Campo etiqueta="Monto" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" error={errores.monto} />
      <Segmentado
        etiqueta="Frecuencia"
        valor={frecuencia}
        opciones={[
          { valor: 'quincenal', etiqueta: 'Cada quincena' },
          { valor: 'mensual', etiqueta: 'Una vez al mes' },
        ]}
        onCambiar={setFrecuencia}
      />
      {frecuencia === 'mensual' && <Campo etiqueta="Día del mes en que se cobra" value={diaMes} onChangeText={setDiaMes} keyboardType="number-pad" error={errores.diaMes} />}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>Categoría</Text>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </View>
      {recurrente && <TextoTenue>El cambio aplica desde el próximo cobro. Lo que ya se cobró no cambia; si hace falta, corrígelo en Historial.</TextoTenue>}
      {mutacion.isError && <TextoError>{mutacion.error.message}</TextoError>}
      <Boton onPress={guardar} cargando={mutacion.isPending}>
        Guardar
      </Boton>
    </>
  );
}
