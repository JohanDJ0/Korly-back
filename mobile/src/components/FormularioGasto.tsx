import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CampoFecha } from '@/components/CampoFecha';
import { GuardarComoAtajo } from '@/components/GuardarComoAtajo';
import { PasoDeGuia, Resaltado } from '@/components/PasoDeGuia';
import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { Boton, Campo, estilos as ui, TextoError } from '@/components/ui';
import { useCategorias } from '@/hooks/use-categorias';
import { useDisponible } from '@/hooks/use-disponible';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useGuia } from '@/hooks/use-guia';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';
import { pesosACentavos } from '@/lib/dinero';
import { hoyISO } from '@/lib/fechas';
import { TEXTOS_GUIA } from '@/lib/guia';
import { colores } from '@/lib/tema';

interface Props {
  periodoId: string;
  onRegistrado?: () => void;
  /** Valores con los que arranca (un atajo que superó lo disponible): el monto en pesos, tal como se escribiría. */
  inicial?: { monto: string; categoriaId?: string | null; nota?: string };
}

/**
 * Igual que frontend/src/components/FormularioGasto.tsx: el monto es lo único que normalmente se toca (fecha = hoy,
 * categoría y nota opcionales). **Solo si el gasto supera lo disponible** se pide un segundo toque explícito: el backend
 * lo registra igual, pero un cero de más por un dedazo es una mala sorpresa.
 */
export function FormularioGasto({ periodoId, onRegistrado, inicial }: Props) {
  const formatearMonto = useFormatearMonto();
  const registrarGasto = useRegistrarGasto();
  const { data: disponible } = useDisponible();
  const { data: categorias } = useCategorias();
  const guia = useGuia();
  // Paso de la guía (lib/guia.ts): una pista sobre "Guardar como atajo", solo si ya leyó cómo registrar un gasto.
  const pistaDeAtajo = guia.activa && guia.vistos.has('registrar-gasto') && !guia.vistos.has('atajo-formulario');
  const [monto, setMonto] = useState(inicial?.monto ?? '');
  const [fecha, setFecha] = useState(hoyISO());
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? '');
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [errorMonto, setErrorMonto] = useState<string | null>(null);
  // El monto (en centavos) que superó lo disponible y espera que la persona lo confirme o lo corrija.
  const [aConfirmar, setAConfirmar] = useState<number | null>(null);

  const centavos = pesosACentavos(monto);

  /** Cuánto le faltaría a la quincena (centavos, positivo) con este gasto; 0 si alcanza o si no se sabe el disponible. */
  function faltante(valor: number): number {
    if (disponible?.estado !== 'ok') return 0;
    return Math.max(0, valor - disponible.disponible.valorMinimo);
  }

  // El aviso solo vale mientras el monto escrito sea el mismo que lo disparó: si lo corrige, desaparece solo.
  const mostrandoAviso = aConfirmar !== null && centavos === aConfirmar && faltante(aConfirmar) > 0;

  function alEnviar() {
    if (centavos === null) {
      setErrorMonto('El monto debe ser mayor a cero');
      return;
    }
    setErrorMonto(null);
    if (faltante(centavos) > 0) {
      setAConfirmar(centavos);
      return;
    }
    enviar(centavos);
  }

  function enviar(valor: number) {
    setAConfirmar(null);
    registrarGasto.mutate(
      { periodoId, monto: { valorMinimo: valor, moneda: 'MXN' }, fechaEfectiva: fecha, categoriaId: categoriaId || undefined, nota: nota.trim() || undefined },
      {
        onSuccess: () => {
          // La pista de la guía se da por leída cuando el formulario cumple su función (registrar).
          if (pistaDeAtajo) guia.marcarVisto('atajo-formulario');
          setMonto('');
          setNota('');
          setCategoriaId('');
          setFecha(hoyISO());
          onRegistrado?.();
        },
      }
    );
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={estilos.montoCaja}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={estilos.signo}>$</Text>
          <TextInput
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="0.00"
            placeholderTextColor="#c4c4c4"
            accessibilityLabel="¿Cuánto gastaste?"
            style={estilos.monto}
          />
        </View>
        {errorMonto && <TextoError>{errorMonto}</TextoError>}
      </View>

      <View style={{ gap: 10 }}>
        <Text style={estilos.rotulo}>CATEGORÍA</Text>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </View>

      <CampoFecha etiqueta="FECHA" valor={fecha} onCambio={setFecha} />

      <Campo etiqueta="NOTA (OPCIONAL)" value={nota} onChangeText={setNota} placeholder="p. ej. comida con el equipo" maxLength={200} />

      {registrarGasto.isError && <TextoError>{registrarGasto.error.message}</TextoError>}

      {mostrandoAviso && aConfirmar !== null && disponible?.estado === 'ok' ? (
        <View style={ui.cajaError} accessibilityRole="alert">
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: colores.texto }}>Este gasto es mayor a lo que tienes disponible</Text>
          <Text style={ui.tenue}>
            Tienes {formatearMonto(disponible.disponible)} y este gasto es de {formatearMonto({ valorMinimo: aConfirmar, moneda: disponible.disponible.moneda })}: tu quincena quedaría en{' '}
            <Text style={{ color: colores.peligro, fontWeight: '700' }}>-{formatearMonto({ valorMinimo: faltante(aConfirmar), moneda: disponible.disponible.moneda })}</Text>.
          </Text>
          <Boton variante="peligro" onPress={() => enviar(aConfirmar)} cargando={registrarGasto.isPending}>
            Registrar de todos modos
          </Boton>
          <Boton variante="contorno" onPress={() => setAConfirmar(null)}>
            Corregir el monto
          </Boton>
        </View>
      ) : (
        <Boton onPress={alEnviar} cargando={registrarGasto.isPending}>
          {`Registrar${centavos !== null ? ` ${(centavos / 100).toFixed(2)}` : ''}`}
        </Boton>
      )}

      {centavos !== null && (
        <>
          {pistaDeAtajo && (
            <PasoDeGuia texto={TEXTOS_GUIA['atajo-formulario'].texto} etiquetaPrincipal="Entendido" onPrincipal={() => guia.marcarVisto('atajo-formulario')} onSaltar={() => void guia.terminar()} />
          )}
          <Resaltado activo={pistaDeAtajo} radio={12} style={{ alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 4 }}>
            <GuardarComoAtajo
              centavos={centavos}
              categoriaId={categoriaId}
              nombreSugerido={nota || categorias?.find((c) => c.id === categoriaId)?.nombre || ''}
              onGuardado={() => guia.marcarVisto('atajo-formulario')}
            />
          </Resaltado>
        </>
      )}

      {/* Hallazgo real de la web: una compra con tarjeta de crédito registrada como gasto normal no cuadra con la tarjeta. */}
      <Pressable onPress={() => router.navigate('/tarjetas')}>
        <Text style={{ textAlign: 'center', color: colores.textoTenue, fontSize: 12.5, textDecorationLine: 'underline' }}>¿Lo pagaste con tarjeta de crédito? Regístralo en Tarjetas</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  montoCaja: { alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: colores.borde, paddingBottom: 14 },
  signo: { fontSize: 30, fontWeight: '700', color: '#a3a3a3' },
  monto: { fontSize: 44, fontWeight: '800', color: colores.texto, minWidth: 160, textAlign: 'center', padding: 0 },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.5 },
});
