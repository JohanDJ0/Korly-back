import { ChevronDown, ChevronUp, CreditCard } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { Boton, Campo, Chip, confirmar, HojaInferior, TextoError, TextoTenue } from '@/components/ui';
import { useCargosTarjeta } from '@/hooks/use-cargos-tarjeta';
import { useEliminarCargo } from '@/hooks/use-eliminar-cargo';
import { useEliminarTarjeta } from '@/hooks/use-eliminar-tarjeta';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useRegistrarCargo } from '@/hooks/use-registrar-cargo';
import type { Tarjeta } from '@/hooks/use-tarjetas';
import { pesosACentavos } from '@/lib/dinero';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/components/FilaTarjeta.tsx: deuda y disponible de un vistazo; las compras se piden solo al
 * expandir. Eliminar siempre se ofrece: el backend la borra o la archiva, o explica por qué no (TARJETA_CON_HISTORIAL).
 */
export function FilaTarjeta({ tarjeta }: { tarjeta: Tarjeta }) {
  const formatearMonto = useFormatearMonto();
  const [mostrarFormularioCargo, setMostrarFormularioCargo] = useState(false);
  const [mostrarCargos, setMostrarCargos] = useState(false);
  const { data: cargosSinFiltrar, isLoading: cargandoCargos } = useCargosTarjeta(mostrarCargos ? tarjeta.id : undefined);
  const cargos = cargosSinFiltrar?.filter((c) => !c.revertido);
  const eliminarTarjeta = useEliminarTarjeta();
  const eliminarCargo = useEliminarCargo();
  const porcentajeUsado = tarjeta.limiteCredito.valorMinimo > 0 ? Math.min(100, (tarjeta.deuda.valorMinimo / tarjeta.limiteCredito.valorMinimo) * 100) : 0;

  return (
    <View style={{ gap: 10 }}>
      <View style={estilos.tarjeta}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <CreditCard size={20} color={colores.dorado} />
            <Text style={{ color: colores.heroTexto, fontSize: 15, fontWeight: '700', flexShrink: 1 }}>{tarjeta.nombre}</Text>
          </View>
          <Text style={estilos.tenue}>Corte día {tarjeta.diaCorte}</Text>
        </View>
        <View>
          <Text style={estilos.tenue}>Debes</Text>
          <Text style={{ color: colores.heroTexto, fontSize: 32, fontWeight: '800', marginTop: 2 }}>{formatearMonto(tarjeta.deuda)}</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={estilos.barra}>
            <View style={[estilos.relleno, { width: `${porcentajeUsado}%` }]} />
          </View>
          <Text style={estilos.tenue}>
            {formatearMonto(tarjeta.creditoDisponible)} disponible de {formatearMonto(tarjeta.limiteCredito)}
          </Text>
        </View>
        <Text style={[estilos.tenue, { fontSize: 12.5 }]}>{tarjeta.diasParaPago} días para pagar</Text>
        {eliminarTarjeta.isError && <Text style={{ color: colores.heroRojo, fontSize: 14 }}>{eliminarTarjeta.error.message}</Text>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Pressable onPress={() => setMostrarFormularioCargo(true)} style={[estilos.botonTarjeta, { backgroundColor: colores.primario }]}>
            <Text style={estilos.botonTarjetaTexto}>Registrar cargo</Text>
          </Pressable>
          <Pressable onPress={() => setMostrarCargos((v) => !v)} style={[estilos.botonTarjeta, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', flexDirection: 'row', gap: 4 }]}>
            <Text style={estilos.botonTarjetaTexto}>{mostrarCargos ? 'Ocultar' : 'Ver compras'}</Text>
            {mostrarCargos ? <ChevronUp size={14} color="#fff" /> : <ChevronDown size={14} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => confirmar(`¿Eliminar la tarjeta "${tarjeta.nombre}"?`, 'Eliminar', () => eliminarTarjeta.mutate(tarjeta.id))}
        disabled={eliminarTarjeta.isPending}
        style={{ alignSelf: 'flex-end', padding: 6 }}
      >
        <Text style={{ color: colores.peligro, fontSize: 13.5, fontWeight: '600' }}>Eliminar tarjeta</Text>
      </Pressable>

      {mostrarCargos && (
        <View style={{ gap: 10 }}>
          {cargandoCargos && <TextoTenue>Cargando…</TextoTenue>}
          {cargos?.length === 0 && <TextoTenue>Todavía no hay compras registradas.</TextoTenue>}
          {cargos?.map((cargo) => (
            <View key={cargo.id} style={estilos.cargo}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colores.texto }}>
                    {cargo.descripcion} — {formatearMonto(cargo.montoTotal)}
                    {cargo.numeroPlazos > 1 && ` a ${cargo.numeroPlazos} MSI`}
                  </Text>
                  <Text style={{ fontSize: 12, color: colores.textoTenue }}>{cargo.fechaCompra}</Text>
                </View>
                {eliminarCargo.isError && eliminarCargo.variables?.cargoId === cargo.id ? (
                  <Text style={{ color: colores.peligro, fontSize: 12, maxWidth: 140 }}>{eliminarCargo.error.message}</Text>
                ) : (
                  <Pressable onPress={() => confirmar('¿Corregir este cargo?', 'Corregir', () => eliminarCargo.mutate({ tarjetaId: tarjeta.id, cargoId: cargo.id }))} disabled={eliminarCargo.isPending} hitSlop={6}>
                    <Text style={{ color: colores.peligro, fontSize: 12.5, fontWeight: '600' }}>Corregir</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ gap: 6, marginTop: 8 }}>
                {cargo.mensualidades.map((m) => (
                  <View key={m.numeroPago} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[{ flex: 1, fontSize: 13, color: colores.texto }, m.pagado && { color: colores.textoTenue, textDecorationLine: 'line-through' }]}>
                      {m.numeroPago}/{cargo.numeroPlazos} — {formatearMonto(m.monto)} — vence {m.fechaVencimiento}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: m.pagado ? colores.textoTenue : '#B5680C' }}>{m.pagado ? 'Pagado' : 'Pendiente'}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {mostrarFormularioCargo && (
        <HojaInferior titulo="Registrar cargo" onCerrar={() => setMostrarFormularioCargo(false)}>
          <FormularioCargo tarjetaId={tarjeta.id} onRegistrado={() => setMostrarFormularioCargo(false)} />
        </HojaInferior>
      )}
    </View>
  );
}

const PLAZOS_MSI = [3, 6, 9, 12, 18] as const;
const OTRO_PLAZO = 'otro';

/**
 * Igual que frontend/src/components/FormularioCargo.tsx: de contado o a MSI; "Otro" pide un número libre para una compra
 * que ya traías a medias (se registra el saldo que falta y los pagos que faltan, no los originales).
 */
function FormularioCargo({ tarjetaId, onRegistrado }: { tarjetaId: string; onRegistrado: () => void }) {
  const registrarCargo = useRegistrarCargo();
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [seleccionPlazo, setSeleccionPlazo] = useState<number | typeof OTRO_PLAZO>(1);
  const [plazoLibre, setPlazoLibre] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [errores, setErrores] = useState<{ descripcion?: string; monto?: string }>({});

  const numeroPlazos = seleccionPlazo === OTRO_PLAZO ? Number(plazoLibre) : seleccionPlazo;
  const numeroPlazosValido = Number.isInteger(numeroPlazos) && numeroPlazos >= 1;

  function registrar() {
    const centavos = pesosACentavos(monto);
    const nuevos = {
      descripcion: descripcion.trim().length === 0 ? "Descríbelo (p. ej. 'Laptop')" : undefined,
      monto: centavos === null ? 'El monto debe ser mayor a cero' : undefined,
    };
    setErrores(nuevos);
    if (nuevos.descripcion || centavos === null || !numeroPlazosValido) return;
    registrarCargo.mutate(
      { tarjetaId, descripcion: descripcion.trim(), monto: { valorMinimo: centavos, moneda: 'MXN' }, numeroPlazos, categoriaId: categoriaId || undefined },
      { onSuccess: onRegistrado }
    );
  }

  return (
    <>
      <Campo etiqueta="¿Qué compraste?" value={descripcion} onChangeText={setDescripcion} autoFocus error={errores.descripcion} />
      <Campo etiqueta="Monto total" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" error={errores.monto} />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>Plazo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip texto="De contado" elegido={seleccionPlazo === 1} onPress={() => setSeleccionPlazo(1)} />
          {PLAZOS_MSI.map((plazos) => (
            <Chip key={plazos} texto={`${plazos} MSI`} elegido={seleccionPlazo === plazos} onPress={() => setSeleccionPlazo(plazos)} />
          ))}
          <Chip texto="Otro…" elegido={seleccionPlazo === OTRO_PLAZO} onPress={() => setSeleccionPlazo(OTRO_PLAZO)} />
        </View>
        {seleccionPlazo === OTRO_PLAZO && <Campo etiqueta="Número de plazos" value={plazoLibre} onChangeText={setPlazoLibre} keyboardType="number-pad" />}
        <Text style={{ fontSize: 12, color: colores.textoTenue, lineHeight: 17 }}>
          ¿Esta compra ya tenía pagos hechos antes de usar Korly? Pon aquí el <Text style={{ fontWeight: '700' }}>saldo que aún debes</Text>, y en plazo los{' '}
          <Text style={{ fontWeight: '700' }}>pagos que te faltan</Text> — no el monto ni el plazo originales.
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>Categoría</Text>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </View>
      {seleccionPlazo === OTRO_PLAZO && plazoLibre.length > 0 && !numeroPlazosValido && <TextoError>El número de plazos debe ser un entero de 1 o más</TextoError>}
      {registrarCargo.isError && <TextoError>{registrarCargo.error.message}</TextoError>}
      <Boton onPress={registrar} cargando={registrarCargo.isPending} deshabilitado={!numeroPlazosValido}>
        Registrar cargo
      </Boton>
    </>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { backgroundColor: colores.hero, borderRadius: 20, padding: 20, gap: 14 },
  tenue: { color: colores.heroTextoTenue, fontSize: 12 },
  barra: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4, backgroundColor: colores.dorado },
  botonTarjeta: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  botonTarjetaTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cargo: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, borderRadius: 16, padding: 16 },
});
