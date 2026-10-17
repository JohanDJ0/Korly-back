import { router } from 'expo-router';
import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DesglosePeriodo } from '@/components/DesglosePeriodo';
import { FilaGasto, FilaIngreso } from '@/components/FilasMovimiento';
import { Boton, Cargando, Chip, Encabezado, Pantalla, TextoError, TextoTenue } from '@/components/ui';
import { useExportar } from '@/hooks/use-exportar';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useGastos } from '@/hooks/use-gastos';
import { useIngresos } from '@/hooks/use-ingresos';
import { usePagosTarjetaPeriodo } from '@/hooks/use-pagos-tarjeta-periodo';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { usePeriodos } from '@/hooks/use-periodos';
import { useSuscripcion } from '@/hooks/use-suscripcion';
import { ApiError } from '@/lib/api';
import { formatearFechaHora, formatearRangoFechas } from '@/lib/fechas';
import { colores } from '@/lib/tema';

type Filtro = 'todo' | 'ingresos' | 'gastos';

/**
 * Igual que frontend/src/routes/Historial.tsx. Sin `periodoIdDeRuta` muestra la quincena activa; con uno, ESA quincena
 * (cerrada o no). Lo editado o eliminado no se muestra (el backend lo guarda para siempre como corrección, pero para la
 * persona "lo eliminé y sigue apareciendo" se ve mal).
 *
 * Pendiente frente a la web: importar CSV (en el teléfono haría falta elegir un archivo).
 */
export function VistaHistorial({ periodoIdDeRuta, desgloseAbierto = false }: { periodoIdDeRuta?: string; desgloseAbierto?: boolean }) {
  const formatearMonto = useFormatearMonto();
  const { data: periodoActivo, error: errorPeriodoActivo } = usePeriodoActivo();
  const { data: periodos } = usePeriodos();
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [mostrarDesglose, setMostrarDesglose] = useState(desgloseAbierto);

  const sinPeriodoActivo = !periodoIdDeRuta && errorPeriodoActivo instanceof ApiError && errorPeriodoActivo.codigo === 'PERIODO_NO_ENCONTRADO';
  const periodoId = periodoIdDeRuta ?? (!errorPeriodoActivo ? periodoActivo?.id : undefined);
  const periodoViendose = periodoIdDeRuta ? periodos?.find((p) => p.id === periodoIdDeRuta) : periodoActivo;

  const { data: ingresos, isLoading: cargandoIngresos, error: errorIngresos } = useIngresos(periodoId);
  const { data: gastos, isLoading: cargandoGastos, error: errorGastos, fetchNextPage, hasNextPage, isFetchingNextPage } = useGastos(periodoId);
  const { data: pagosTarjeta } = usePagosTarjetaPeriodo(periodoId);

  const ingresosVigentes = (ingresos ?? []).filter((i) => !i.revertido);
  const gastosVigentes = (gastos?.pages.flatMap((pagina) => pagina.datos) ?? []).filter((g) => !g.revertido);

  const periodosAnteriores = (periodos ?? []).filter((p) => (p.estado === 'cerrado' || p.estado === 'archivado') && p.id !== periodoId);
  // Dos periodos cerrados con el mismo rango (cerrar antes de tiempo y crear otro): solo entonces se muestra cuándo se creó.
  const conteoRangos = periodosAnteriores.reduce<Record<string, number>>((conteo, p) => {
    const clave = `${p.fechaInicio}|${p.fechaFin}`;
    conteo[clave] = (conteo[clave] ?? 0) + 1;
    return conteo;
  }, {});

  const exportar = useExportar();
  const { data: suscripcion } = useSuscripcion();
  const exportacionDisponible = suscripcion?.plan === 'pro';

  return (
    <Pantalla>
      <Encabezado titulo="Historial" conVolver={periodoIdDeRuta !== undefined} />

      {/* Exporta TODO el historial de la cuenta (no solo esta quincena); el archivo se abre en el menú de compartir. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Boton chico variante="contorno" deshabilitado={!exportacionDisponible} cargando={exportar.isPending && exportar.variables === 'gastos'} onPress={() => exportar.mutate('gastos')} icono={<Download size={13} color={colores.texto} />}>
          Gastos (CSV)
        </Boton>
        <Boton chico variante="contorno" deshabilitado={!exportacionDisponible} cargando={exportar.isPending && exportar.variables === 'ingresos'} onPress={() => exportar.mutate('ingresos')} icono={<Download size={13} color={colores.texto} />}>
          Ingresos (CSV)
        </Boton>
      </View>
      {suscripcion && !exportacionDisponible && <Text style={estilos.detalle}>Exportar a CSV es parte de Korly Pro.</Text>}
      {exportar.isError && <TextoError>{exportar.error.message}</TextoError>}

      {periodoViendose && (
        <Text style={estilos.detalle}>
          Quincena · {formatearRangoFechas(periodoViendose.fechaInicio, periodoViendose.fechaFin)}
          {periodoViendose.estado !== 'activo' && ` · ${periodoViendose.estado}`}
          {periodoIdDeRuta && periodoActivo && periodoActivo.id !== periodoIdDeRuta && (
            <>
              {' · '}
              <Text style={{ color: colores.primario, fontWeight: '700' }} onPress={() => router.navigate('/historial')}>
                ver periodo activo
              </Text>
            </>
          )}
        </Text>
      )}

      {sinPeriodoActivo && <TextoTenue>No hay periodo activo todavía.</TextoTenue>}

      {periodoId && (
        <>
          <Boton chico variante="contorno" onPress={() => setMostrarDesglose((v) => !v)} style={{ alignSelf: 'flex-start' }}>
            {mostrarDesglose ? 'Ocultar desglose' : 'Ver desglose del periodo'}
          </Boton>
          {mostrarDesglose && <DesglosePeriodo periodoId={periodoId} />}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['todo', 'ingresos', 'gastos'] as const).map((opcion) => (
              <Chip key={opcion} texto={opcion[0].toUpperCase() + opcion.slice(1)} elegido={filtro === opcion} onPress={() => setFiltro(opcion)} />
            ))}
          </View>
        </>
      )}

      {periodoId && (filtro === 'todo' || filtro === 'ingresos') && (
        <View>
          <Text style={estilos.rotulo}>INGRESOS</Text>
          {cargandoIngresos && <Cargando />}
          {errorIngresos && <TextoError>{errorIngresos.message}</TextoError>}
          {!cargandoIngresos && ingresosVigentes.length === 0 && <TextoTenue>Sin ingresos todavía.</TextoTenue>}
          {ingresosVigentes.map((ingreso) => (
            <FilaIngreso key={ingreso.id} ingreso={ingreso} esElUnico={ingresosVigentes.length === 1} />
          ))}
        </View>
      )}

      {periodoId && (filtro === 'todo' || filtro === 'gastos') && (
        <View>
          <Text style={estilos.rotulo}>GASTOS</Text>
          {cargandoGastos && <Cargando />}
          {errorGastos && <TextoError>{errorGastos.message}</TextoError>}
          {!cargandoGastos && gastosVigentes.length === 0 && <TextoTenue>Sin gastos todavía.</TextoTenue>}
          {gastosVigentes.map((gasto) => (
            <FilaGasto key={gasto.id} gasto={gasto} />
          ))}
          {hasNextPage && (
            <Boton variante="contorno" onPress={() => void fetchNextPage()} cargando={isFetchingNextPage} style={{ marginTop: 12 }}>
              Cargar más
            </Boton>
          )}
        </View>
      )}

      {/* Un pago de tarjeta es otro tipo de movimiento: nunca aparece en "Gastos", así que se lista aparte. */}
      {pagosTarjeta && pagosTarjeta.length > 0 && (
        <View>
          <Text style={estilos.rotulo}>PAGOS DE TARJETA</Text>
          {pagosTarjeta.map((pago, indice) => (
            <View key={indice} style={estilos.renglon}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colores.texto }}>{formatearMonto(pago.monto)}</Text>
              <Text style={estilos.detalle}>
                {pago.tarjetaNombre} — {pago.cargoDescripcion} ({pago.numeroPago}/{pago.numeroPlazos})
              </Text>
            </View>
          ))}
        </View>
      )}

      {periodosAnteriores.length > 0 && (
        <View>
          <Text style={estilos.rotulo}>PERIODOS ANTERIORES</Text>
          {periodosAnteriores.map((p) => (
            <View key={p.id} style={[estilos.renglon, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/periodo/${p.id}`)} accessibilityRole="link">
                <Text style={{ fontSize: 14, color: colores.texto, textDecorationLine: 'underline' }}>
                  {formatearRangoFechas(p.fechaInicio, p.fechaFin)}
                  {(conteoRangos[`${p.fechaInicio}|${p.fechaFin}`] ?? 0) > 1 && <Text style={estilos.detalle}> — creado {formatearFechaHora(p.creadoEn)}</Text>}
                </Text>
              </Pressable>
              <Boton chico variante="contorno" onPress={() => router.push(`/resumen/${p.id}`)}>
                Ver resumen
              </Boton>
            </View>
          ))}
        </View>
      )}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4, marginBottom: 2 },
  detalle: { fontSize: 13, color: colores.textoTenue },
  renglon: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde, gap: 2 },
});
