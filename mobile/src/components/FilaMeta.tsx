import { ChevronDown, ChevronUp, Plus, Target } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, confirmar, HojaInferior, Segmentado, Tarjeta, TextoError, TextoTenue } from '@/components/ui';
import { useAportarMeta } from '@/hooks/use-aportar-meta';
import { useDepositarMeta } from '@/hooks/use-depositar-meta';
import { useDeshacerPagoMeta } from '@/hooks/use-deshacer-pago-meta';
import { useDisponible } from '@/hooks/use-disponible';
import { useEditarMeta } from '@/hooks/use-editar-meta';
import { useEliminarMeta } from '@/hooks/use-eliminar-meta';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import type { Meta } from '@/hooks/use-metas';
import { useMovimientosMeta, type MovimientoMeta } from '@/hooks/use-movimientos-meta';
import { usePagarMeta } from '@/hooks/use-pagar-meta';
import { useRetirarMeta } from '@/hooks/use-retirar-meta';
import { pesosACentavos } from '@/lib/dinero';
import { formatearFechaActividad } from '@/lib/fechas';
import { colores } from '@/lib/tema';

type Modo = 'aportar' | 'pagar' | 'retirar' | 'editar' | null;
type OrigenAporte = 'quincena' | 'externo';

const AYUDA_POR_MODO = {
  aportar: 'Se descuenta de lo que puedes gastar en tu quincena.',
  aportarExterno: 'Es dinero que ya tenías fuera de Korly. Entra directo a la meta y no cambia lo que puedes gastar en tu quincena.',
  pagar: 'Sale directo de la meta. No cuenta en el presupuesto ni en los gastos de tu quincena.',
  retirar: 'Pasa a tu quincena como ingreso: aumenta lo que puedes gastar y cuenta como ingreso del periodo.',
} as const;

function etiquetaMovimiento(movimiento: MovimientoMeta): string {
  if (movimiento.tipo === 'pago') return `Pago: ${movimiento.nota ?? 'sin motivo'}`;
  if (movimiento.tipo === 'retiro') return `A la quincena: ${movimiento.nota ?? 'sin motivo'}`;
  if (movimiento.tipo === 'deposito') return movimiento.nota ? `Aporte externo: ${movimiento.nota}` : 'Aporte externo';
  return 'Aporte';
}

/**
 * Igual que frontend/src/components/FilaMeta.tsx: dos botones principales con una elección dentro.
 * - **Agregar dinero**: "De mi quincena" (aportar, limitado a lo disponible) o "Ya lo tenía ahorrado" (entra directo).
 * - **Usar dinero**: "Pagar algo" (sale de la meta, no toca la quincena) o "Pasar a mi quincena" (como un ingreso).
 * Editar y Eliminar van al pie. Sin quincena activa, el error del backend se muestra tal cual.
 */
export function FilaMeta({ meta }: { meta: Meta }) {
  const formatearMonto = useFormatearMonto();
  const [modo, setModo] = useState<Modo>(null);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [origen, setOrigen] = useState<OrigenAporte>('quincena');
  const [mostrarMovimientos, setMostrarMovimientos] = useState(false);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [objetivoEdicion, setObjetivoEdicion] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const aportarMeta = useAportarMeta();
  const retirarMeta = useRetirarMeta();
  const pagarMeta = usePagarMeta();
  const depositarMeta = useDepositarMeta();
  const deshacerPago = useDeshacerPagoMeta();
  const eliminarMeta = useEliminarMeta();
  const editarMeta = useEditarMeta();
  const { data: disponible } = useDisponible();
  const { data: movimientos, isLoading: cargandoMovimientos } = useMovimientosMeta(mostrarMovimientos ? meta.id : undefined);

  function cerrar() {
    setModo(null);
    setMonto('');
    setMotivo('');
    setOrigen('quincena');
    setErrorValidacion(null);
    aportarMeta.reset();
    depositarMeta.reset();
    retirarMeta.reset();
    pagarMeta.reset();
    editarMeta.reset();
  }

  function abrirEdicion() {
    setNombreEdicion(meta.nombre);
    setObjetivoEdicion(String(meta.montoObjetivo.valorMinimo / 100));
    setErrorValidacion(null);
    setModo('editar');
  }

  function guardarEdicion() {
    const nombre = nombreEdicion.trim();
    const objetivo = pesosACentavos(objetivoEdicion);
    if (nombre.length === 0) return setErrorValidacion('El nombre no puede estar vacío');
    if (objetivo === null) return setErrorValidacion('El objetivo debe ser mayor a cero');
    setErrorValidacion(null);
    editarMeta.mutate({ metaId: meta.id, nombre, montoObjetivo: { valorMinimo: objetivo, moneda: meta.montoObjetivo.moneda } }, { onSuccess: cerrar });
  }

  function confirmarMovimiento() {
    const centavos = pesosACentavos(monto);
    if (centavos === null) return setErrorValidacion('El monto debe ser mayor a cero');
    if (modo === 'retirar' && motivo.trim().length === 0) return setErrorValidacion('Indica un motivo para el retiro');
    // El backend también rechaza estos casos; aquí se evita el viaje y se dice cuánto hay.
    if (modo === 'retirar' && centavos > meta.montoAcumulado.valorMinimo) return setErrorValidacion(`La meta solo tiene ${formatearMonto(meta.montoAcumulado)}`);
    if (modo === 'aportar' && origen === 'quincena' && disponible?.estado === 'ok' && centavos > disponible.disponible.valorMinimo) {
      return setErrorValidacion(`Tu quincena solo tiene ${formatearMonto(disponible.disponible)} disponible`);
    }
    if (modo === 'pagar' && motivo.trim().length === 0) return setErrorValidacion('Indica en qué usas este dinero');
    if (modo === 'pagar' && centavos > meta.montoAcumulado.valorMinimo) return setErrorValidacion(`La meta solo tiene ${formatearMonto(meta.montoAcumulado)}`);
    setErrorValidacion(null);
    const montoDto = { valorMinimo: centavos, moneda: meta.montoObjetivo.moneda };

    if (modo === 'aportar' && origen === 'externo') depositarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo: motivo.trim() || undefined }, { onSuccess: cerrar });
    else if (modo === 'aportar') aportarMeta.mutate({ metaId: meta.id, monto: montoDto }, { onSuccess: cerrar });
    else if (modo === 'retirar') retirarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    else if (modo === 'pagar') pagarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
  }

  const pendiente = aportarMeta.isPending || retirarMeta.isPending || pagarMeta.isPending || depositarMeta.isPending || editarMeta.isPending;
  const mensajeError = errorValidacion ?? (aportarMeta.error ?? depositarMeta.error ?? retirarMeta.error ?? pagarMeta.error ?? editarMeta.error)?.message;
  const porcentaje = Math.min(100, meta.porcentajeAvance);
  const aportaExterno = modo === 'aportar' && origen === 'externo';
  const pideMotivo = modo === 'retirar' || modo === 'pagar' || aportaExterno;
  const enMovimiento = modo === 'aportar' || modo === 'pagar' || modo === 'retirar';

  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={estilos.icono}>
          <Target size={17} color="#146155" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colores.texto }}>{meta.nombre}</Text>
          <Text style={estilos.detalle}>
            {formatearMonto(meta.montoAcumulado)} de {formatearMonto(meta.montoObjetivo)}
          </Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colores.primario }}>{meta.porcentajeAvance.toFixed(0)}%</Text>
      </View>

      <View style={estilos.barra}>
        <View style={[estilos.relleno, { width: `${porcentaje}%` }]} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Boton chico variante="contorno" style={{ flex: 1 }} onPress={() => setModo('aportar')} icono={<Plus size={14} color={colores.texto} />}>
          Agregar dinero
        </Boton>
        <Boton chico variante="contorno" style={{ flex: 1 }} onPress={() => setModo('pagar')}>
          Usar dinero
        </Boton>
      </View>
      {eliminarMeta.isError && <TextoError>{eliminarMeta.error.message}</TextoError>}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setMostrarMovimientos((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colores.textoTenue }}>{mostrarMovimientos ? 'Ocultar movimientos' : 'Ver movimientos'}</Text>
          {mostrarMovimientos ? <ChevronUp size={13} color={colores.textoTenue} /> : <ChevronDown size={13} color={colores.textoTenue} />}
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={abrirEdicion} hitSlop={6} style={{ padding: 6 }}>
            <Text style={{ fontSize: 12.5, color: colores.textoTenue }}>Editar</Text>
          </Pressable>
          <Pressable onPress={() => confirmar(`¿Eliminar la meta "${meta.nombre}"?`, 'Eliminar', () => eliminarMeta.mutate(meta.id))} hitSlop={6} style={{ padding: 6 }} disabled={eliminarMeta.isPending}>
            <Text style={{ fontSize: 12.5, color: colores.peligro }}>Eliminar</Text>
          </Pressable>
        </View>
      </View>

      {mostrarMovimientos && (
        <View>
          {cargandoMovimientos && <TextoTenue>Cargando…</TextoTenue>}
          {movimientos?.length === 0 && <TextoTenue>Todavía no hay movimientos.</TextoTenue>}
          {movimientos?.map((movimiento, indice) => {
            const entra = movimiento.monto.valorMinimo > 0;
            const tachado = movimiento.revertido ? ({ textDecorationLine: 'line-through', color: colores.textoTenue } as const) : null;
            const sePuedeDeshacer = (movimiento.tipo === 'pago' || movimiento.tipo === 'deposito') && !movimiento.revertido;
            return (
              <View key={movimiento.id} style={[{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8 }, indice > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 13, fontWeight: '500', color: colores.texto }, tachado]}>{etiquetaMovimiento(movimiento)}</Text>
                  <Text style={{ fontSize: 11.5, color: colores.textoTenue }}>
                    {formatearFechaActividad(movimiento.fechaEfectiva)}
                    {movimiento.revertido ? ' · deshecho' : ''}
                  </Text>
                  {sePuedeDeshacer && (
                    <Pressable
                      disabled={deshacerPago.isPending}
                      hitSlop={6}
                      onPress={() =>
                        confirmar(movimiento.tipo === 'pago' ? '¿Deshacer este pago? El dinero vuelve a la meta.' : '¿Deshacer este aporte? El dinero sale de la meta.', 'Deshacer', () =>
                          deshacerPago.mutate({ metaId: meta.id, movimientoId: movimiento.id, tipo: movimiento.tipo === 'pago' ? 'pago' : 'deposito' })
                        )
                      }
                    >
                      <Text style={{ fontSize: 12, color: colores.peligro, marginTop: 2 }}>Deshacer</Text>
                    </Pressable>
                  )}
                  {deshacerPago.isError && deshacerPago.variables?.movimientoId === movimiento.id && <TextoError>{deshacerPago.error.message}</TextoError>}
                </View>
                <Text style={[{ fontSize: 13, fontWeight: '700', color: colores.texto }, tachado]}>
                  {entra ? '+' : '-'}
                  {formatearMonto({ valorMinimo: Math.abs(movimiento.monto.valorMinimo), moneda: movimiento.monto.moneda })}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {modo === 'editar' && (
        <HojaInferior titulo="Editar meta" onCerrar={cerrar}>
          <Campo etiqueta="Nombre" value={nombreEdicion} onChangeText={(t) => (setNombreEdicion(t), setErrorValidacion(null))} autoFocus />
          <Campo etiqueta="Objetivo" value={objetivoEdicion} onChangeText={(t) => (setObjetivoEdicion(t), setErrorValidacion(null))} keyboardType="decimal-pad" ayuda="Lo que ya ahorraste no cambia: solo se recalcula el avance." />
          {mensajeError && <TextoError>{mensajeError}</TextoError>}
          <Boton onPress={guardarEdicion} cargando={pendiente}>
            Guardar
          </Boton>
        </HojaInferior>
      )}

      {enMovimiento && (
        <HojaInferior titulo={modo === 'aportar' ? 'Agregar dinero' : 'Usar dinero'} onCerrar={cerrar}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colores.texto }}>{meta.nombre}</Text>
          {modo === 'aportar' ? (
            <Segmentado
              etiqueta="¿De dónde sale el dinero?"
              valor={origen}
              opciones={[
                { valor: 'quincena', etiqueta: 'De mi quincena' },
                { valor: 'externo', etiqueta: 'Ya lo tenía ahorrado' },
              ]}
              onCambiar={(valor) => (setOrigen(valor), setErrorValidacion(null))}
            />
          ) : (
            <Segmentado
              etiqueta="¿Qué haces con el dinero?"
              valor={modo}
              opciones={[
                { valor: 'pagar', etiqueta: 'Pagar algo' },
                { valor: 'retirar', etiqueta: 'Pasar a mi quincena' },
              ]}
              onCambiar={(valor) => (setModo(valor), setErrorValidacion(null))}
            />
          )}
          <Campo etiqueta="Monto" value={monto} onChangeText={(t) => (setMonto(t), setErrorValidacion(null))} keyboardType="decimal-pad" autoFocus />
          {pideMotivo && (
            <Campo
              etiqueta={modo === 'pagar' ? '¿En qué lo usas?' : aportaExterno ? 'Origen (opcional)' : 'Motivo'}
              value={motivo}
              onChangeText={(t) => (setMotivo(t), setErrorValidacion(null))}
            />
          )}
          <TextoTenue>
            {AYUDA_POR_MODO[aportaExterno ? 'aportarExterno' : modo]}
            {modo === 'aportar' && origen === 'quincena' && disponible?.estado === 'ok' && ` Tienes ${formatearMonto(disponible.disponible)} disponible.`}
            {(modo === 'pagar' || modo === 'retirar') && ` La meta tiene ${formatearMonto(meta.montoAcumulado)}.`}
          </TextoTenue>
          {mensajeError && <TextoError>{mensajeError}</TextoError>}
          <Boton onPress={confirmarMovimiento} cargando={pendiente}>
            {modo === 'aportar' ? 'Aportar' : modo === 'pagar' ? 'Pagar' : 'Pasar'}
          </Boton>
        </HojaInferior>
      )}
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  icono: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eaf5f1', alignItems: 'center', justifyContent: 'center' },
  detalle: { fontSize: 12.5, color: colores.textoTenue, marginTop: 1 },
  barra: { height: 8, borderRadius: 4, backgroundColor: '#f2f2f2', overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4, backgroundColor: colores.dorado },
});
