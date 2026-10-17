import { StyleSheet, Text, View } from 'react-native';

import { BotonOjito } from '@/components/ui';
import type { DisponibleOk } from '@/hooks/use-disponible';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { colores } from '@/lib/tema';

/**
 * La cifra del día, con las mismas reglas que frontend/src/components/CifraDisponible.tsx: nunca sin los días restantes,
 * y "hoy" y "total" se pintan de rojo cada uno según SU propio signo.
 */
export function CifraDelDia({ disponible }: { disponible: DisponibleOk }) {
  const formatearMonto = useFormatearMonto();
  const totalNegativo = disponible.disponible.valorMinimo < 0;
  const teExcedisteHoy = disponible.cifraDiaria.valorMinimo < 0;
  const gastadoHoy = disponible.gastadoHoy.valorMinimo;
  const objetivoHoy = disponible.cifraDiaria.valorMinimo + gastadoHoy;
  const porcentaje = teExcedisteHoy ? 100 : objetivoHoy > 0 ? Math.min(100, (gastadoHoy / objetivoHoy) * 100) : 0;
  const cifra = teExcedisteHoy ? { ...disponible.cifraDiaria, valorMinimo: -disponible.cifraDiaria.valorMinimo } : disponible.cifraDiaria;
  const dias = disponible.diasRestantes;

  return (
    <View style={estilos.tarjeta}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={estilos.tenue}>{teExcedisteHoy ? 'Te excediste hoy por' : 'Puedes gastar hoy'}</Text>
        <BotonOjito claro />
      </View>
      <Text style={[estilos.cifra, teExcedisteHoy && { color: colores.heroRojo }]} adjustsFontSizeToFit numberOfLines={1}>
        {formatearMonto(cifra)}
      </Text>
      <View style={estilos.barra}>
        <View style={[estilos.relleno, { width: `${porcentaje}%`, backgroundColor: teExcedisteHoy ? colores.heroRojo : colores.dorado }]} />
      </View>
      <Text style={estilos.chico}>
        por día, durante {dias} día{dias === 1 ? '' : 's'} más
      </Text>
      {gastadoHoy > 0 && (
        <Text style={estilos.chico}>
          Ya gastaste {formatearMonto(disponible.gastadoHoy)} de tu objetivo de hoy de {formatearMonto({ ...disponible.cifraDiaria, valorMinimo: objetivoHoy })}
        </Text>
      )}
      <View style={estilos.separador} />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.chico}>Disponible total</Text>
          <Text style={[estilos.dato, totalNegativo && { color: colores.heroRojo }]}>{formatearMonto(disponible.disponible)}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={estilos.chico}>Días restantes</Text>
          <Text style={estilos.dato}>{dias}</Text>
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { backgroundColor: colores.hero, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 24, gap: 8 },
  tenue: { color: colores.heroTextoTenue, fontSize: 14, fontWeight: '500' },
  cifra: { color: colores.heroTexto, fontSize: 52, fontWeight: '800', letterSpacing: -1 },
  barra: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 4 },
  relleno: { height: '100%', borderRadius: 4 },
  chico: { color: colores.heroTextoTenue, fontSize: 12.5 },
  separador: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 6 },
  dato: { color: colores.heroTexto, fontSize: 18, fontWeight: '700', marginTop: 2 },
});
