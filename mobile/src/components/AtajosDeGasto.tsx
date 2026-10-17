import { Check, Zap } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Boton, TextoError } from '@/components/ui';
import { useAtajos, type Atajo } from '@/hooks/use-atajos';
import { useDisponible } from '@/hooks/use-disponible';
import { useEliminarGasto } from '@/hooks/use-eliminar-gasto';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';
import { hoyISO } from '@/lib/fechas';
import { colores } from '@/lib/tema';

/** Cuánto se ofrece "Deshacer" tras registrar con un atajo. */
const MS_PARA_DESHACER = 7000;

/**
 * Igual que frontend/src/components/AtajosDeGasto.tsx: un toque registra el gasto de hoy con el monto, la categoría y el
 * nombre (como nota). Si el atajo supera lo disponible no se registra directo: se abre el formulario prellenado (con su
 * aviso). Cada toque repetido registra otro gasto y cada "Deshacer" quita uno, del último al primero.
 */
export function AtajosDeGasto({ periodoId, onAbrirFormulario }: { periodoId: string; onAbrirFormulario: (atajo: Atajo) => void }) {
  const formatearMonto = useFormatearMonto();
  const { data: lista } = useAtajos();
  const { data: disponible } = useDisponible();
  const registrarGasto = useRegistrarGasto();
  const eliminarGasto = useEliminarGasto();
  const [registrados, setRegistrados] = useState<{ gastoId: string; nombre: string; monto: Atajo['monto'] }[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function reiniciarTemporizador() {
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setRegistrados([]), MS_PARA_DESHACER);
  }

  function tocar(atajo: Atajo) {
    if (registrarGasto.isPending) return;
    eliminarGasto.reset();
    if (disponible?.estado === 'ok' && atajo.monto.valorMinimo > disponible.disponible.valorMinimo) {
      onAbrirFormulario(atajo);
      return;
    }
    registrarGasto.mutate(
      { periodoId, monto: atajo.monto, fechaEfectiva: hoyISO(), categoriaId: atajo.categoriaId ?? undefined, nota: atajo.nombre },
      {
        onSuccess: (gasto) => {
          setRegistrados((previos) => [...previos, { gastoId: gasto.id, nombre: atajo.nombre, monto: atajo.monto }]);
          reiniciarTemporizador();
        },
      }
    );
  }

  const ultimo = registrados[registrados.length - 1];

  function deshacer() {
    if (!ultimo) return;
    eliminarGasto.mutate(ultimo.gastoId, {
      onSuccess: () => {
        setRegistrados((previos) => previos.filter((r) => r.gastoId !== ultimo.gastoId));
        reiniciarTemporizador();
      },
    });
  }

  const atajos = lista?.atajos ?? [];
  if (atajos.length === 0 && registrados.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {atajos.length > 0 && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Zap size={12} color={colores.textoTenue} strokeWidth={2.5} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 }}>ATAJOS · un toque registra el gasto</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {atajos.map((atajo) => (
              <Pressable
                key={atajo.id}
                onPress={() => tocar(atajo)}
                disabled={registrarGasto.isPending}
                accessibilityRole="button"
                style={({ pressed }) => [
                  { flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
                  (pressed || registrarGasto.isPending) && { opacity: 0.6 },
                ]}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '500', color: colores.texto }}>{atajo.nombre}</Text>
                <Text style={{ fontSize: 13.5, color: colores.textoTenue }}>{formatearMonto(atajo.monto)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {ultimo && (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eaf5f1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Check size={15} color="#146155" strokeWidth={2.5} />
          <Text style={{ flex: 1, fontSize: 13, color: '#146155' }}>
            {registrados.length === 1
              ? `Registrado: ${ultimo.nombre} ${formatearMonto(ultimo.monto)}`
              : `Registraste ${registrados.length} gastos. El último: ${ultimo.nombre} ${formatearMonto(ultimo.monto)}`}
          </Text>
          <Boton chico variante="plano" onPress={deshacer} cargando={eliminarGasto.isPending}>
            {registrados.length > 1 ? 'Deshacer el último' : 'Deshacer'}
          </Boton>
        </View>
      )}
      {registrarGasto.isError && <TextoError>{registrarGasto.error.message}</TextoError>}
      {eliminarGasto.isError && <TextoError>{eliminarGasto.error.message}</TextoError>}
    </View>
  );
}
