import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAtajos, useCategorias, useRegistrarGasto, type Atajo } from '@/hooks/datos';
import { ApiError } from '@/lib/api';
import { formatearMonto, pesosACentavos } from '@/lib/dinero';
import { hoyISO } from '@/lib/fechas';
import { colores } from '@/lib/tema';

/**
 * Registrar un gasto: los atajos de la persona (un toque) y el formulario corto (monto, categoría, nota). Mismo endpoint
 * que la web (POST /periodos/:id/gastos). En el spike no hay "Deshacer" ni confirmación de sobregiro: eso llega con la
 * pantalla completa.
 */
export function RegistrarGasto({ periodoId }: { periodoId: string }) {
  const categorias = useCategorias(true);
  const atajos = useAtajos(true);
  const registrar = useRegistrarGasto();
  const [monto, setMonto] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | undefined>(undefined);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(centavos: number, extra: { categoriaId?: string; nota?: string }, descripcion: string) {
    setError(null);
    setAviso(null);
    try {
      await registrar.mutateAsync({ periodoId, monto: { valorMinimo: centavos, moneda: 'MXN' }, fechaEfectiva: hoyISO(), ...extra });
      setAviso(`Listo: ${descripcion}`);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
      return false;
    }
  }

  async function registrarFormulario() {
    const centavos = pesosACentavos(monto);
    if (centavos === null) return setError('Escribe un monto válido, por ejemplo 45 o 45.50');
    const nombreCategoria = categorias.data?.find((c) => c.id === categoriaId)?.nombre;
    const ok = await enviar(centavos, { categoriaId, nota: nota.trim() || undefined }, `${formatearMonto({ valorMinimo: centavos, moneda: 'MXN' })}${nombreCategoria ? ` en ${nombreCategoria}` : ''}`);
    if (ok) {
      setMonto('');
      setNota('');
      setCategoriaId(undefined);
    }
  }

  function usarAtajo(atajo: Atajo) {
    if (registrar.isPending) return; // evita registrar dos veces con toques seguidos (hallazgo de la web)
    void enviar(atajo.monto.valorMinimo, { categoriaId: atajo.categoriaId ?? undefined, nota: atajo.nombre }, `${atajo.nombre} ${formatearMonto(atajo.monto)}`);
  }

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>Registrar gasto</Text>

      {(atajos.data?.atajos.length ?? 0) > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {atajos.data!.atajos.map((atajo) => (
            <Pressable key={atajo.id} onPress={() => usarAtajo(atajo)} style={({ pressed }) => [estilos.atajo, pressed && { opacity: 0.7 }]}>
              <Text style={estilos.atajoTexto}>
                {atajo.nombre} · {formatearMonto(atajo.monto)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <TextInput value={monto} onChangeText={setMonto} placeholder="Monto, p. ej. 45.50" keyboardType="decimal-pad" style={estilos.input} placeholderTextColor={colores.textoTenue} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {categorias.data?.map((categoria) => {
          const elegida = categoria.id === categoriaId;
          return (
            <Pressable key={categoria.id} onPress={() => setCategoriaId(elegida ? undefined : categoria.id)} style={[estilos.chip, elegida && estilos.chipElegido]}>
              <Text style={[estilos.chipTexto, elegida && { color: colores.primarioTexto }]}>{categoria.nombre}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <TextInput value={nota} onChangeText={setNota} placeholder="Nota (opcional)" style={estilos.input} placeholderTextColor={colores.textoTenue} maxLength={200} />

      {error && <Text style={estilos.error}>{error}</Text>}
      {aviso && <Text style={estilos.aviso}>{aviso}</Text>}

      <Pressable onPress={() => void registrarFormulario()} disabled={registrar.isPending} style={({ pressed }) => [estilos.boton, (pressed || registrar.isPending) && { opacity: 0.8 }]}>
        {registrar.isPending ? <ActivityIndicator color={colores.primarioTexto} /> : <Text style={estilos.botonTexto}>Registrar gasto</Text>}
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: colores.borde },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  input: { borderWidth: 1, borderColor: colores.borde, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colores.texto },
  atajo: { backgroundColor: '#fff4d6', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  atajoTexto: { color: colores.doradoTexto, fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: colores.borde, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipElegido: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { color: colores.texto },
  error: { color: colores.peligro, fontSize: 14 },
  aviso: { color: colores.primario, fontSize: 14, fontWeight: '600' },
  boton: { backgroundColor: colores.primario, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  botonTexto: { color: colores.primarioTexto, fontSize: 16, fontWeight: '700' },
});
