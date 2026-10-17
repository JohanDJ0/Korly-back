import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CifraDelDia } from '@/components/CifraDelDia';
import { ReaceptarAviso } from '@/components/ReaceptarAviso';
import { RegistrarGasto } from '@/components/RegistrarGasto';
import { useDisponible } from '@/hooks/datos';
import { useSesion } from '@/hooks/use-sesion';
import { ApiError } from '@/lib/api';
import { aceptoAvisoVigente } from '@/lib/aviso';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

/**
 * Inicio del spike: la cifra del día y registrar un gasto. Crear la quincena, registrar el ingreso y todo lo demás sigue
 * en la web por ahora (se ofrece el enlace).
 */
export default function Inicio() {
  const { session } = useSesion();
  const avisoAceptado = aceptoAvisoVigente(session?.user.user_metadata);
  const disponible = useDisponible(avisoAceptado);

  if (!avisoAceptado) return <ReaceptarAviso />;

  const sinPeriodo = disponible.error instanceof ApiError && disponible.error.status === 404;

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView
        contentContainerStyle={estilos.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={disponible.isRefetching} onRefresh={() => void disponible.refetch()} colors={[colores.primario]} />}
      >
        <View style={estilos.encabezado}>
          <Text style={estilos.marca}>Korly</Text>
          <Pressable onPress={() => void supabase.auth.signOut()}>
            <Text style={estilos.salir}>Cerrar sesión</Text>
          </Pressable>
        </View>

        {disponible.isPending && <ActivityIndicator color={colores.primario} size="large" style={{ marginTop: 40 }} />}

        {sinPeriodo && (
          <Mensaje titulo="Todavía no tienes una quincena activa" texto="Por ahora créala desde la web; en cuanto exista, aparece aquí." />
        )}

        {disponible.error && !sinPeriodo && (
          <Mensaje titulo="No pudimos cargar tu cifra" texto="Revisa tu conexión y desliza hacia abajo para intentar de nuevo." />
        )}

        {disponible.data?.estado === 'sin_ingreso' && (
          <Mensaje titulo="Falta tu ingreso de esta quincena" texto="Regístralo desde la web y aquí verás cuánto puedes gastar hoy." />
        )}

        {disponible.data?.estado === 'ok' && (
          <>
            <CifraDelDia disponible={disponible.data} />
            <RegistrarGasto periodoId={disponible.data.periodoId} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <View style={estilos.mensaje}>
      <Text style={estilos.mensajeTitulo}>{titulo}</Text>
      <Text style={estilos.mensajeTexto}>{texto}</Text>
      <Pressable onPress={() => void Linking.openURL('https://app.korly.com.mx')}>
        <Text style={estilos.enlace}>Abrir Korly en la web</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, gap: 16, paddingBottom: 40 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  marca: { fontSize: 24, fontWeight: '800', color: colores.primario },
  salir: { color: colores.textoTenue, fontSize: 14 },
  mensaje: { backgroundColor: colores.tarjeta, borderRadius: 20, padding: 20, gap: 8, borderWidth: 1, borderColor: colores.borde },
  mensajeTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  mensajeTexto: { fontSize: 14, color: colores.textoTenue, lineHeight: 20 },
  enlace: { color: colores.primario, fontWeight: '700', marginTop: 4 },
});
