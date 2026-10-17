import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { estilos } from '@/components/ui';
import { formatearFechaActividad } from '@/lib/fechas';
import { colores } from '@/lib/tema';

/** 'YYYY-MM-DD' ↔ Date en la zona del teléfono (nunca UTC: "hoy" saltaría de día desde las 6 pm en México). */
function aFecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

function aIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

/** Equivale al `<input type="date">` de la web: muestra "Hoy" o "16 oct" y abre el calendario nativo de Android. */
export function CampoFecha({ etiqueta, valor, onCambio, ayuda }: { etiqueta: string; valor: string; onCambio: (iso: string) => void; ayuda?: string }) {
  function abrir() {
    DateTimePickerAndroid.open({
      value: aFecha(valor),
      mode: 'date',
      onChange: (evento, fecha) => {
        if (evento.type === 'set' && fecha) onCambio(aIso(fecha));
      },
    });
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Pressable onPress={abrir} accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${formatearFechaActividad(valor)}`} style={[estilos.input, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <Calendar size={17} color={colores.primario} />
        <Text style={{ fontSize: 15, fontWeight: '500', color: colores.texto }}>{formatearFechaActividad(valor)}</Text>
      </Pressable>
      {ayuda && <Text style={estilos.tenueChico}>{ayuda}</Text>}
    </View>
  );
}
