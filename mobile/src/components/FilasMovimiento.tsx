import { TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CampoFecha } from '@/components/CampoFecha';
import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { Boton, Campo, confirmar, HojaInferior, TextoError } from '@/components/ui';
import { useCategorias } from '@/hooks/use-categorias';
import { useEditarGasto } from '@/hooks/use-editar-gasto';
import { useEditarIngreso } from '@/hooks/use-editar-ingreso';
import { useEliminarGasto } from '@/hooks/use-eliminar-gasto';
import { useEliminarIngreso } from '@/hooks/use-eliminar-ingreso';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import type { Gasto } from '@/hooks/use-gastos';
import type { Ingreso } from '@/hooks/use-ingresos';
import { pesosACentavos } from '@/lib/dinero';
import { formatearFechaActividad } from '@/lib/fechas';
import { iconoCategoria } from '@/lib/icono-categoria';
import { colores } from '@/lib/tema';

// Filas de Historial (equivalen a FilaGasto y FilaIngreso de la web). En el teléfono, tocar la fila abre una hoja con
// "Editar" y "Eliminar" en vez de botones en cada renglón (no caben). Editar o eliminar nunca muta la fila: el backend
// genera una reversión (y, al editar, una fila nueva), así que tras guardar la lista se refresca sola.

/** Editar un gasto: monto, fecha y categoría precargados (abrir y guardar sin tocar nada no cambia nada por accidente). */
export function FilaGasto({ gasto }: { gasto: Gasto }) {
  const formatearMonto = useFormatearMonto();
  const { data: categorias } = useCategorias();
  const editarGasto = useEditarGasto();
  const eliminarGasto = useEliminarGasto();
  const [abierta, setAbierta] = useState(false);
  const [monto, setMonto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [fecha, setFecha] = useState(gasto.fechaEfectiva);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const categoria = categorias?.find((c) => c.id === gasto.categoriaId);
  const Icono = iconoCategoria(categoria?.nombre, categoria?.icono);

  function abrir() {
    editarGasto.reset();
    eliminarGasto.reset();
    setMonto((gasto.monto.valorMinimo / 100).toString());
    setCategoriaId(gasto.categoriaId ?? '');
    setFecha(gasto.fechaEfectiva);
    setErrorValidacion(null);
    setAbierta(true);
  }

  function guardar() {
    const centavos = pesosACentavos(monto);
    if (centavos === null) return setErrorValidacion('El monto debe ser mayor a cero');
    setErrorValidacion(null);
    editarGasto.mutate(
      { gastoId: gasto.id, monto: { valorMinimo: centavos, moneda: gasto.monto.moneda }, categoriaId: categoriaId || undefined, fechaEfectiva: fecha },
      { onSuccess: () => setAbierta(false) }
    );
  }

  function eliminar() {
    confirmar(`¿Eliminar este gasto de ${formatearMonto(gasto.monto)}?`, 'Eliminar', () => eliminarGasto.mutate(gasto.id, { onSuccess: () => setAbierta(false) }));
  }

  const detalle = [formatearFechaActividad(gasto.fechaEfectiva), categoria?.nombre, gasto.nota, gasto.esRecurrente ? 'automático' : undefined].filter(Boolean).join(' — ');

  return (
    <>
      <Pressable onPress={abrir} style={({ pressed }) => [estilos.fila, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityHint="Abre opciones para editar o eliminar">
        <View style={estilos.icono}>
          <Icono size={16} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.monto}>{formatearMonto(gasto.monto)}</Text>
          <Text style={estilos.detalle} numberOfLines={2}>
            {detalle}
          </Text>
        </View>
      </Pressable>

      {abierta && (
        <HojaInferior titulo="Editar gasto" onCerrar={() => setAbierta(false)}>
          <Campo etiqueta="Monto" value={monto} onChangeText={(t) => (setMonto(t), setErrorValidacion(null))} keyboardType="decimal-pad" error={errorValidacion ?? undefined} />
          <CampoFecha etiqueta="Fecha" valor={fecha} onCambio={setFecha} />
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>Categoría</Text>
            <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
          </View>
          {editarGasto.isError && <TextoError>{editarGasto.error.message}</TextoError>}
          {eliminarGasto.isError && <TextoError>{eliminarGasto.error.message}</TextoError>}
          <Boton onPress={guardar} cargando={editarGasto.isPending}>
            Guardar
          </Boton>
          <Boton variante="contorno" onPress={eliminar} cargando={eliminarGasto.isPending}>
            Eliminar gasto
          </Boton>
        </HojaInferior>
      )}
    </>
  );
}

/** Mismo mecanismo que FilaGasto. Si es el único ingreso, la confirmación avisa que sin él no hay cifra. */
export function FilaIngreso({ ingreso, esElUnico = false }: { ingreso: Ingreso; esElUnico?: boolean }) {
  const formatearMonto = useFormatearMonto();
  const editarIngreso = useEditarIngreso();
  const eliminarIngreso = useEliminarIngreso();
  const [abierta, setAbierta] = useState(false);
  const [monto, setMonto] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  function abrir() {
    editarIngreso.reset();
    eliminarIngreso.reset();
    setMonto((ingreso.monto.valorMinimo / 100).toString());
    setErrorValidacion(null);
    setAbierta(true);
  }

  function guardar() {
    const centavos = pesosACentavos(monto);
    if (centavos === null) return setErrorValidacion('El monto debe ser mayor a cero');
    setErrorValidacion(null);
    editarIngreso.mutate({ ingresoId: ingreso.id, monto: { valorMinimo: centavos, moneda: ingreso.monto.moneda } }, { onSuccess: () => setAbierta(false) });
  }

  function eliminar() {
    confirmar(
      `¿Eliminar este ingreso de ${formatearMonto(ingreso.monto)}?`,
      'Eliminar',
      () => eliminarIngreso.mutate(ingreso.id, { onSuccess: () => setAbierta(false) }),
      esElUnico ? 'Es el único de la quincena: sin él no se puede calcular cuánto puedes gastar.' : undefined
    );
  }

  return (
    <>
      <Pressable onPress={abrir} style={({ pressed }) => [estilos.fila, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityHint="Abre opciones para editar o eliminar">
        <View style={estilos.icono}>
          <TrendingUp size={16} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[estilos.monto, { color: colores.primario }]}>+{formatearMonto(ingreso.monto)}</Text>
          <Text style={estilos.detalle}>{[formatearFechaActividad(ingreso.fechaEfectiva), ingreso.nota].filter(Boolean).join(' — ')}</Text>
        </View>
      </Pressable>

      {abierta && (
        <HojaInferior titulo="Editar ingreso" onCerrar={() => setAbierta(false)}>
          <Campo etiqueta="Monto" value={monto} onChangeText={(t) => (setMonto(t), setErrorValidacion(null))} keyboardType="decimal-pad" error={errorValidacion ?? undefined} />
          {editarIngreso.isError && <TextoError>{editarIngreso.error.message}</TextoError>}
          {eliminarIngreso.isError && <TextoError>{eliminarIngreso.error.message}</TextoError>}
          <Boton onPress={guardar} cargando={editarIngreso.isPending}>
            Guardar
          </Boton>
          <Boton variante="contorno" onPress={eliminar} cargando={eliminarIngreso.isPending}>
            Eliminar ingreso
          </Boton>
        </HojaInferior>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde },
  icono: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' },
  monto: { fontSize: 15, fontWeight: '600', color: colores.texto },
  detalle: { fontSize: 13, color: colores.textoTenue },
});
