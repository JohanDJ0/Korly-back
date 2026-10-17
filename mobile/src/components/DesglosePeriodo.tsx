import { StyleSheet, Text, View } from 'react-native';

import { Cargando, TextoError, TextoTenue } from '@/components/ui';
import { useDesglose, type RecurrenteDesglose, type RubroDesglose } from '@/hooks/use-desglose';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { formatearRangoFechas } from '@/lib/fechas';
import { colores } from '@/lib/tema';

const colorDeBarra = (tipo: RubroDesglose['tipo']) => (tipo === 'pagos_tarjeta' ? colores.dorado : colores.primario);

const cuandoSeCobra = (r: RecurrenteDesglose) => (r.frecuencia === 'mensual' && r.diaMes !== null ? `cada mes, día ${r.diaMes}` : 'cada quincena');

/**
 * Igual que frontend/src/components/DesglosePeriodo.tsx: recurrentes y aportes a metas aparte, y el gasto variable por
 * categoría y por semana. "Semana más cara" compara el promedio por día (la segunda semana tiene 8 o 9 días).
 */
export function DesglosePeriodo({ periodoId }: { periodoId: string }) {
  const formatearMonto = useFormatearMonto();
  const { data: desglose, isLoading, error } = useDesglose(periodoId);

  if (isLoading) return <Cargando />;
  if (error) return <TextoError>{error.message}</TextoError>;
  if (!desglose) return null;
  if (desglose.totalGastado.valorMinimo <= 0) return <TextoTenue>Todavía no hay gastos en este periodo para desglosar.</TextoTenue>;

  const moneda = desglose.totalGastado.moneda;
  const totalVariable = desglose.totalVariable.valorMinimo;
  const hayRecurrentes = desglose.recurrentes.items.length > 0;
  const hayAportes = desglose.aportesAMetas.total.valorMinimo > 0;
  const etiquetaDe = new Map(desglose.rubros.map((r) => [r.clave, r.etiqueta]));
  const mayorPromedio = Math.max(...desglose.semanas.map((s) => s.promedioDiario.valorMinimo), 1);
  const totalDias = desglose.semanas.reduce((suma, s) => suma + s.dias, 0);
  const promedioDelPeriodo = Math.floor(totalVariable / totalDias);
  const semanaMasCara = desglose.semanas.find((s) => s.numero === desglose.semanaMasCara);

  return (
    <View style={{ gap: 16 }}>
      {hayRecurrentes && (
        <View style={{ gap: 8 }}>
          <Text style={estilos.rotulo}>GASTOS RECURRENTES</Text>
          <View style={estilos.caja}>
            {desglose.recurrentes.items.map((recurrente) => (
              <View key={recurrente.id} style={estilos.renglon}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nombre} numberOfLines={1}>
                    {recurrente.descripcion}
                  </Text>
                  <Text style={estilos.detalle}>{cuandoSeCobra(recurrente)}</Text>
                </View>
                <Text style={estilos.monto}>{formatearMonto(recurrente.monto)}</Text>
              </View>
            ))}
            <View style={estilos.renglon}>
              <Text style={[estilos.detalle, { flex: 1, fontSize: 13 }]}>Total recurrentes</Text>
              <Text style={[estilos.monto, { fontWeight: '800' }]}>{formatearMonto(desglose.recurrentes.total)}</Text>
            </View>
          </View>
        </View>
      )}

      {hayAportes && (
        <View style={{ gap: 8 }}>
          <Text style={estilos.rotulo}>APORTES A METAS</Text>
          <View style={[estilos.caja, estilos.renglon]}>
            <Text style={[estilos.detalle, { flex: 1, fontSize: 13.5 }]}>Ahorrado esta quincena</Text>
            <Text style={[estilos.monto, { fontWeight: '800' }]}>{formatearMonto(desglose.aportesAMetas.total)}</Text>
          </View>
        </View>
      )}

      {(hayRecurrentes || hayAportes) && (
        <Text style={estilos.detalle}>
          Gastado {formatearMonto(desglose.totalGastado)} ={hayRecurrentes ? ` ${formatearMonto(desglose.recurrentes.total)} recurrentes +` : ''}
          {hayAportes ? ` ${formatearMonto(desglose.aportesAMetas.total)} aportes a metas +` : ''} {formatearMonto({ valorMinimo: totalVariable, moneda })} variable. Abajo solo se analiza el gasto
          variable.
        </Text>
      )}

      {totalVariable <= 0 ? (
        <TextoTenue>No hay gasto variable en este periodo — todo lo gastado fue recurrente o ahorro a metas.</TextoTenue>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Text style={estilos.rotulo}>GASTO VARIABLE POR CATEGORÍA</Text>
            <View style={[estilos.caja, { padding: 16, gap: 14 }]}>
              {desglose.rubros.map((rubro) => {
                const porcentaje = Math.max(0, Math.min(100, (rubro.monto.valorMinimo / totalVariable) * 100));
                return (
                  <View key={rubro.clave} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={[estilos.nombre, { flex: 1 }]} numberOfLines={1}>
                        {rubro.etiqueta}
                      </Text>
                      <Text style={estilos.monto}>{formatearMonto(rubro.monto)}</Text>
                      <Text style={[estilos.detalle, { width: 40, textAlign: 'right' }]}>{Math.round(porcentaje)}%</Text>
                    </View>
                    <View style={estilos.barra}>
                      <View style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: colorDeBarra(rubro.tipo) }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={estilos.rotulo}>GASTO VARIABLE POR SEMANA</Text>
            {semanaMasCara && (
              <Text style={{ fontSize: 13, color: colores.texto }}>
                La <Text style={{ fontWeight: '700' }}>semana {semanaMasCara.numero}</Text> fue la más cara por día: {formatearMonto(semanaMasCara.promedioDiario)} al día, contra{' '}
                {formatearMonto({ valorMinimo: promedioDelPeriodo, moneda })} de promedio en todo el periodo.
              </Text>
            )}
            <View style={estilos.caja}>
              {desglose.semanas.map((semana) => {
                const esLaMasCara = semana.numero === desglose.semanaMasCara;
                const porcentaje = Math.max(0, (semana.promedioDiario.valorMinimo / mayorPromedio) * 100);
                const principales = [...semana.rubros]
                  .filter((r) => r.monto.valorMinimo > 0)
                  .sort((a, b) => b.monto.valorMinimo - a.monto.valorMinimo)
                  .slice(0, 3);
                return (
                  <View key={semana.numero} style={[estilos.renglon, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colores.texto }}>Semana {semana.numero}</Text>
                          {esLaMasCara && <Text style={estilos.insignia}>Más cara</Text>}
                        </View>
                        <Text style={estilos.detalle}>
                          {formatearRangoFechas(semana.fechaInicio, semana.fechaFin)} ·{' '}
                          {semana.diasTranscurridos === 0
                            ? `todavía no empieza · ${semana.dias} días`
                            : semana.diasTranscurridos < semana.dias
                              ? `en curso, ${semana.diasTranscurridos} de ${semana.dias} días`
                              : `${semana.dias} días`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[estilos.monto, { fontSize: 15, fontWeight: '800' }]}>{formatearMonto(semana.total)}</Text>
                        <Text style={estilos.detalle}>{formatearMonto(semana.promedioDiario)} al día</Text>
                      </View>
                    </View>
                    <View style={estilos.barra}>
                      <View style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: esLaMasCara ? colores.dorado : colores.primario }]} />
                    </View>
                    {principales.length > 0 && <Text style={estilos.detalle}>{principales.map((r) => `${etiquetaDe.get(r.clave) ?? r.clave} ${formatearMonto(r.monto)}`).join(' · ')}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colores.textoTenue, letterSpacing: 0.4 },
  caja: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, borderRadius: 16 },
  renglon: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde },
  nombre: { fontSize: 13.5, fontWeight: '500', color: colores.texto },
  detalle: { fontSize: 12, color: colores.textoTenue },
  monto: { fontSize: 14, fontWeight: '700', color: colores.texto },
  barra: { height: 8, borderRadius: 4, backgroundColor: '#eaf5f1', overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4 },
  insignia: { backgroundColor: 'rgba(254,184,22,0.2)', color: '#146155', fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
