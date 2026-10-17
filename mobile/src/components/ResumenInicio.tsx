import { router } from 'expo-router';
import { PiggyBank } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Tarjeta } from '@/components/ui';
import { useAportesMeta, type AporteDelPeriodo } from '@/hooks/use-aportes-meta';
import { useCategorias } from '@/hooks/use-categorias';
import { useDesglose } from '@/hooks/use-desglose';
import type { DisponibleOk } from '@/hooks/use-disponible';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useGastos, type Gasto } from '@/hooks/use-gastos';
import { formatearFechaActividad } from '@/lib/fechas';
import { iconoCategoria } from '@/lib/icono-categoria';
import { colores } from '@/lib/tema';

// Las tres piezas de Inicio debajo de la cifra, iguales a las de la web (RecordatorioContextual, ActividadReciente y
// ResumenCompactoPeriodo).

/**
 * Siempre trae la cifra accionable y se silencia sola en cuanto hubo actividad hoy (`huboActividadHoy`, no `gastadoHoy`:
 * un retiro de meta que cubre un gasto da neto cero). No repite el "te excediste hoy": la cifra ya lo dice en rojo.
 */
export function RecordatorioContextual({ disponible }: { disponible: DisponibleOk }) {
  const formatearMonto = useFormatearMonto();
  if (disponible.huboActividadHoy || disponible.cifraDiaria.valorMinimo < 0) return null;
  const dias = disponible.diasRestantes;
  return (
    <View style={estilos.recordatorio}>
      <Text style={{ fontSize: 14, color: colores.texto, lineHeight: 20 }}>
        Te quedan {dias} día{dias === 1 ? '' : 's'} con <Text style={{ fontWeight: '700' }}>{formatearMonto(disponible.disponible)}</Text> disponible — hoy puedes gastar hasta{' '}
        <Text style={{ fontWeight: '700' }}>{formatearMonto(disponible.cifraDiaria)}</Text>.
      </Text>
    </View>
  );
}

const LIMITE_VISIBLE = 3;

/** Lo último que pasó: gastos activos y aportes a metas, mezclados por fecha de registro (los ingresos van en Historial). */
export function ActividadReciente({ periodoId }: { periodoId: string }) {
  const formatearMonto = useFormatearMonto();
  const { data } = useGastos(periodoId);
  const { data: categorias } = useCategorias();
  const { data: aportes } = useAportesMeta(periodoId);

  type Entrada = { tipo: 'gasto'; id: string; registro: string; gasto: Gasto } | { tipo: 'ahorro'; id: string; registro: string; aporte: AporteDelPeriodo };
  const entradas: Entrada[] = [
    ...(data?.pages[0]?.datos.filter((g) => !g.revertido).map((gasto): Entrada => ({ tipo: 'gasto', id: gasto.id, registro: gasto.fechaRegistro, gasto })) ?? []),
    ...(aportes?.map((aporte): Entrada => ({ tipo: 'ahorro', id: `ahorro-${aporte.id}`, registro: aporte.fechaRegistro, aporte })) ?? []),
  ]
    .sort((a, b) => (a.registro < b.registro ? 1 : a.registro > b.registro ? -1 : 0))
    .slice(0, LIMITE_VISIBLE);

  if (entradas.length === 0) return null;

  return (
    <Tarjeta style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colores.texto }}>Actividad reciente</Text>
        <Pressable onPress={() => router.navigate('/historial')} hitSlop={8}>
          <Text style={estilos.enlace}>Ver todo</Text>
        </Pressable>
      </View>
      {entradas.map((entrada, indice) => {
        const esAhorro = entrada.tipo === 'ahorro';
        const categoria = !esAhorro ? categorias?.find((c) => c.id === entrada.gasto.categoriaId) : undefined;
        const Icono = esAhorro ? PiggyBank : iconoCategoria(categoria?.nombre, categoria?.icono);
        return (
          <View key={entrada.id}>
            {indice > 0 && <View style={estilos.separador} />}
            <View style={estilos.fila}>
              <View style={[estilos.icono, { backgroundColor: esAhorro ? '#fef3c7' : '#eaf5f1' }]}>
                <Icono size={17} color={esAhorro ? '#146155' : '#146155'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.filaTitulo} numberOfLines={1}>
                  {esAhorro ? `Ahorro a ${entrada.aporte.metaNombre}` : (categoria?.nombre ?? 'Sin categoría')}
                </Text>
                <Text style={estilos.filaDetalle}>
                  {esAhorro
                    ? `${formatearFechaActividad(entrada.aporte.fechaEfectiva)} · a tu meta`
                    : `${formatearFechaActividad(entrada.gasto.fechaEfectiva)}${entrada.gasto.esRecurrente ? ' · automático' : ''}`}
                </Text>
              </View>
              <Text style={estilos.filaMonto}>-{formatearMonto(esAhorro ? entrada.aporte.monto : entrada.gasto.monto)}</Text>
            </View>
          </View>
        );
      })}
    </Tarjeta>
  );
}

const MAX_CATEGORIAS = 3;

/** Versión de bolsillo del desglose: 3 categorías principales, recurrentes y ahorro aparte, y una barra por semana. */
export function ResumenCompactoPeriodo({ periodoId }: { periodoId: string }) {
  const formatearMonto = useFormatearMonto();
  const { data: desglose } = useDesglose(periodoId);
  if (!desglose || desglose.totalGastado.valorMinimo <= 0) return null;

  const moneda = desglose.totalGastado.moneda;
  const totalVariable = desglose.totalVariable.valorMinimo;
  const hayRecurrentes = desglose.recurrentes.items.length > 0;
  const hayAportes = desglose.aportesAMetas.total.valorMinimo > 0;
  const principales = desglose.rubros.slice(0, MAX_CATEGORIAS);
  const restantes = desglose.rubros.length - principales.length;
  const periodoTerminado = desglose.semanas.every((s) => s.diasTranscurridos >= s.dias);
  const semanasConDias = desglose.semanas.filter((s) => s.diasTranscurridos > 0);
  const semanaEnCurso = periodoTerminado ? undefined : semanasConDias[semanasConDias.length - 1];
  const mayorTotal = Math.max(...desglose.semanas.map((s) => s.total.valorMinimo), 1);

  return (
    <Tarjeta style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={estilos.rotulo}>EN QUÉ LLEVAS GASTADO</Text>
        <Pressable onPress={() => router.navigate({ pathname: '/historial', params: { desglose: '1' } })} hitSlop={8}>
          <Text style={estilos.enlace}>Ver desglose →</Text>
        </Pressable>
      </View>

      {totalVariable > 0 && (
        <View style={{ gap: 10 }}>
          {principales.map((rubro) => {
            const porcentaje = Math.max(0, Math.min(100, (rubro.monto.valorMinimo / totalVariable) * 100));
            return (
              <View key={rubro.clave} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: colores.texto }} numberOfLines={1}>
                    {rubro.etiqueta}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colores.texto }}>{formatearMonto(rubro.monto)}</Text>
                </View>
                <View style={estilos.barra}>
                  <View style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: rubro.tipo === 'pagos_tarjeta' ? colores.dorado : colores.primario }]} />
                </View>
              </View>
            );
          })}
          {restantes > 0 && <Text style={estilos.filaDetalle}>y {restantes} más</Text>}
        </View>
      )}

      {(hayRecurrentes || hayAportes) && (
        <View style={[estilos.bloque, { gap: 6 }]}>
          {hayRecurrentes && (
            <View style={estilos.parValor}>
              <Text style={estilos.filaDetalleGrande}>Recurrentes (aparte)</Text>
              <Text style={estilos.valor}>{formatearMonto(desglose.recurrentes.total)}</Text>
            </View>
          )}
          {hayAportes && (
            <View style={estilos.parValor}>
              <Text style={estilos.filaDetalleGrande}>Ahorro en metas (aparte)</Text>
              <Text style={estilos.valor}>{formatearMonto(desglose.aportesAMetas.total)}</Text>
            </View>
          )}
        </View>
      )}

      {totalVariable > 0 && (
        <View style={[estilos.bloque, { gap: 8 }]}>
          {desglose.semanas.map((semana) => {
            const enCurso = semana.numero === semanaEnCurso?.numero;
            const todaviaNoEmpieza = semana.diasTranscurridos === 0;
            const porcentaje = Math.max(0, (semana.total.valorMinimo / mayorTotal) * 100);
            return (
              <View key={semana.numero} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: todaviaNoEmpieza ? 0.5 : 1 }}>
                <Text style={{ width: 70, fontSize: 12.5, fontWeight: enCurso ? '700' : '400', color: enCurso ? colores.texto : colores.textoTenue }}>Semana {semana.numero}</Text>
                <View style={[estilos.barra, { flex: 1 }]}>
                  <View style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: enCurso ? colores.dorado : colores.primario }]} />
                </View>
                <Text style={{ width: 84, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colores.texto }}>{todaviaNoEmpieza ? '—' : formatearMonto(semana.total)}</Text>
              </View>
            );
          })}
          <Text style={estilos.filaDetalle}>
            {semanaEnCurso
              ? `Semana ${semanaEnCurso.numero} en curso: ${formatearMonto(semanaEnCurso.promedioDiario)} al día, ${semanaEnCurso.diasTranscurridos} de ${semanaEnCurso.dias} días.`
              : `Gasto variable de la quincena, sin recurrentes: ${formatearMonto({ valorMinimo: totalVariable, moneda })}.`}
          </Text>
        </View>
      )}
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  recordatorio: { borderWidth: 1, borderColor: 'rgba(22,127,108,0.4)', backgroundColor: 'rgba(22,127,108,0.05)', borderRadius: 16, padding: 16 },
  enlace: { color: colores.primario, fontSize: 13, fontWeight: '700' },
  separador: { height: 1, backgroundColor: colores.borde },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icono: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filaTitulo: { fontSize: 14, fontWeight: '500', color: colores.texto },
  filaDetalle: { fontSize: 12, color: colores.textoTenue },
  filaDetalleGrande: { fontSize: 13, color: colores.textoTenue },
  filaMonto: { fontSize: 14.5, fontWeight: '700', color: colores.texto },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 },
  barra: { height: 6, borderRadius: 3, backgroundColor: '#eaf5f1', overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 3 },
  bloque: { borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: 12 },
  parValor: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  valor: { fontSize: 13, fontWeight: '700', color: colores.texto },
});
