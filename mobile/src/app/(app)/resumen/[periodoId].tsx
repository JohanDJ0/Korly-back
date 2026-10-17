import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DesglosePeriodo } from '@/components/DesglosePeriodo';
import { Boton, Cargando, Chip, Encabezado, Pantalla, Tarjeta, TextoError, TextoTenue, Titulo } from '@/components/ui';
import { useCrearPeriodo } from '@/hooks/use-crear-periodo';
import { useDecidirSobrante } from '@/hooks/use-decidir-sobrante';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useMetas } from '@/hooks/use-metas';
import { usePeriodos } from '@/hooks/use-periodos';
import { useReabrirPeriodo } from '@/hooks/use-reabrir-periodo';
import { useResumen } from '@/hooks/use-resumen';
import { hoyISO } from '@/lib/fechas';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/routes/Resumen.tsx: el resumen inmutable de un periodo cerrado. Un déficit ya se arrastró solo;
 * solo un sobrante positivo pide decidir (arrastrar o ahorrar en una meta). Reabrir se ofrece mientras siga la quincena y
 * el sobrante no se haya guardado en una meta; el backend valida el resto y su razón se muestra tal cual.
 */
export default function Resumen() {
  const formatearMonto = useFormatearMonto();
  const { periodoId } = useLocalSearchParams<{ periodoId: string }>();
  const { data: resumen, isLoading, error } = useResumen(periodoId);
  const { data: metas } = useMetas();
  const decidirSobrante = useDecidirSobrante();
  const crearPeriodo = useCrearPeriodo();
  const reabrirPeriodo = useReabrirPeriodo();
  const { data: periodos } = usePeriodos();
  const [mostrarSelectorMeta, setMostrarSelectorMeta] = useState(false);
  const [metaSeleccionada, setMetaSeleccionada] = useState('');

  const esDeficit = resumen ? resumen.sobrante.valorMinimo < 0 : false;
  const periodoDelResumen = periodos?.find((p) => p.id === resumen?.periodoId);
  // Con una quincena activa no hay nada que crear: pedirlo dejaría un borrador duplicado.
  const hayPeriodoActivo = periodos?.some((p) => p.estado === 'activo') ?? true;
  const sePuedeIntentarReabrir = periodoDelResumen?.estado === 'cerrado' && periodoDelResumen.fechaFin >= hoyISO() && resumen?.decisionSobrante !== 'ahorrado';

  return (
    <Pantalla>
      <Encabezado titulo="Resumen del periodo" conVolver />
      {isLoading && <Cargando />}
      {error && <TextoError>{error.message}</TextoError>}

      {resumen && (
        <>
          <View style={estilos.hero}>
            <Text style={estilos.heroTenue}>{esDeficit ? 'Déficit del periodo' : 'Sobrante del periodo'}</Text>
            <Text style={[estilos.heroCifra, esDeficit && { color: colores.heroRojo }]} adjustsFontSizeToFit numberOfLines={1}>
              {formatearMonto(resumen.sobrante)}
            </Text>
            <View style={estilos.separador} />
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.heroChico}>Ingresos</Text>
                <Text style={estilos.heroDato}>{formatearMonto(resumen.totalIngresos)}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={estilos.heroChico}>Gastado</Text>
                <Text style={estilos.heroDato}>{formatearMonto(resumen.totalGastado)}</Text>
              </View>
            </View>
          </View>

          {sePuedeIntentarReabrir && (
            <Tarjeta>
              <Titulo>¿Lo cerraste sin querer?</Titulo>
              <TextoTenue>Puedes reabrirlo y seguir registrando en este periodo, siempre que no hayas decidido qué hacer con el sobrante.</TextoTenue>
              <Boton variante="contorno" cargando={reabrirPeriodo.isPending} onPress={() => reabrirPeriodo.mutate(resumen.periodoId, { onSuccess: () => router.navigate('/') })}>
                Reabrir periodo
              </Boton>
              {reabrirPeriodo.isError && <TextoError>{reabrirPeriodo.error.message}</TextoError>}
            </Tarjeta>
          )}

          <DesglosePeriodo periodoId={resumen.periodoId} />

          {resumen.decisionSobrante === 'pendiente' && (
            <Tarjeta>
              <Titulo>¿Qué hacemos con el sobrante?</Titulo>
              <TextoTenue>Si no decides en unos días, se arrastra automático al periodo siguiente.</TextoTenue>
              <Boton cargando={decidirSobrante.isPending && decidirSobrante.variables?.decision === 'arrastrar'} deshabilitado={decidirSobrante.isPending} onPress={() => decidirSobrante.mutate({ periodoId: resumen.periodoId, decision: 'arrastrar' })}>
                Arrastrar al periodo siguiente
              </Boton>

              {!mostrarSelectorMeta && (
                <>
                  <Boton variante="contorno" deshabilitado={decidirSobrante.isPending || metas?.length === 0} onPress={() => setMostrarSelectorMeta(true)}>
                    Ahorrar en una meta
                  </Boton>
                  {metas?.length === 0 && <Text style={{ fontSize: 12.5, color: colores.textoTenue }}>Primero crea una meta en la pestaña Metas.</Text>}
                </>
              )}

              {mostrarSelectorMeta && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>Elige una meta</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {metas?.map((meta) => (
                      <Chip key={meta.id} texto={meta.nombre} elegido={metaSeleccionada === meta.id} onPress={() => setMetaSeleccionada(meta.id)} />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Boton
                      style={{ flex: 1 }}
                      deshabilitado={!metaSeleccionada}
                      cargando={decidirSobrante.isPending}
                      onPress={() => decidirSobrante.mutate({ periodoId: resumen.periodoId, decision: 'ahorrar', metaId: metaSeleccionada })}
                    >
                      Confirmar
                    </Boton>
                    <Boton variante="plano" onPress={() => setMostrarSelectorMeta(false)}>
                      Cancelar
                    </Boton>
                  </View>
                </View>
              )}
              {decidirSobrante.isError && <TextoError>{decidirSobrante.error.message}</TextoError>}
            </Tarjeta>
          )}

          {resumen.decisionSobrante === 'arrastrado' && <TextoTenue>{esDeficit ? 'Este déficit' : 'Este sobrante'} se arrastrará al periodo siguiente.</TextoTenue>}
          {resumen.decisionSobrante === 'ahorrado' && <TextoTenue>Este sobrante se guardó como ahorro.</TextoTenue>}

          {!hayPeriodoActivo && (
            <>
              <Boton variante="contorno" cargando={crearPeriodo.isPending} onPress={() => crearPeriodo.mutate(undefined, { onSuccess: () => router.navigate('/') })}>
                Crear periodo siguiente
              </Boton>
              {crearPeriodo.isError && <TextoError>{crearPeriodo.error.message}</TextoError>}
            </>
          )}
        </>
      )}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  hero: { backgroundColor: colores.hero, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 24, gap: 8 },
  heroTenue: { color: colores.heroTextoTenue, fontSize: 14, fontWeight: '500' },
  heroCifra: { color: colores.heroTexto, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  separador: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 6 },
  heroChico: { color: colores.heroTextoTenue, fontSize: 11.5 },
  heroDato: { color: colores.heroTexto, fontSize: 18, fontWeight: '700', marginTop: 2 },
});
