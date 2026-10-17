import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { constanciaDeAviso, URL_AVISO_PRIVACIDAD, URL_TERMINOS } from '@/lib/aviso';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/components/ReaceptarAviso.tsx: si la cuenta no aceptó la versión vigente del aviso y los
 * términos, no entra hasta aceptarla, y la constancia queda en los metadatos de Supabase (la misma que guarda la web).
 * Los documentos se abren en la web.
 */
export function ReaceptarAviso() {
  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aceptar() {
    setGuardando(true);
    setError(null);
    const { error: errorDeAuth } = await supabase.auth.updateUser({ data: constanciaDeAviso() });
    setGuardando(false);
    if (errorDeAuth) setError(mensajeDeErrorAuth(errorDeAuth));
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <Text style={estilos.titulo}>Actualizamos nuestros términos y aviso</Text>
        <Text style={estilos.texto}>Para seguir usando Korly necesitamos que los leas y los aceptes de nuevo.</Text>
        <Pressable onPress={() => void Linking.openURL(URL_TERMINOS)}>
          <Text style={estilos.enlace}>Leer los Términos y condiciones</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(URL_AVISO_PRIVACIDAD)}>
          <Text style={estilos.enlace}>Leer el Aviso de privacidad</Text>
        </Pressable>
        <View style={estilos.fila}>
          <Switch value={acepta} onValueChange={setAcepta} trackColor={{ true: colores.primario }} />
          <Text style={[estilos.texto, { flex: 1 }]}>He leído y acepto los Términos y condiciones y el Aviso de privacidad, incluido el tratamiento de mis datos financieros.</Text>
        </View>
        {error && <Text style={{ color: colores.heroRojo }}>{error}</Text>}
        <Pressable onPress={() => void aceptar()} disabled={!acepta || guardando} style={[estilos.boton, (!acepta || guardando) && { opacity: 0.5 }]}>
          {guardando ? <ActivityIndicator color={colores.doradoTexto} /> : <Text style={estilos.botonTexto}>Aceptar y continuar</Text>}
        </Pressable>
        <Pressable onPress={() => void supabase.auth.signOut()} disabled={guardando}>
          <Text style={[estilos.enlace, { textAlign: 'center' }]}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.hero },
  contenido: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  titulo: { color: colores.heroTexto, fontSize: 22, fontWeight: '800' },
  texto: { color: colores.heroTextoTenue, fontSize: 14, lineHeight: 20 },
  enlace: { color: colores.dorado, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boton: { backgroundColor: colores.dorado, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  botonTexto: { color: colores.doradoTexto, fontSize: 16, fontWeight: '800' },
});
