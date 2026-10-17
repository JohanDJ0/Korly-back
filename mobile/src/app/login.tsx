import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaptchaTurnstile, claveDeSitioTurnstile, MENSAJE_CAPTCHA_PENDIENTE, type ControlCaptcha } from '@/components/CaptchaTurnstile';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mismo flujo que frontend/src/routes/Login.tsx: correo + contraseña a Supabase con el token de Turnstile, y el error
 * traducido al español. Registrarse y recuperar la contraseña se quedan en la web en el spike.
 */
export default function Login() {
  const clave = claveDeSitioTurnstile();
  const captcha = useRef<ControlCaptcha>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [falloCaptcha, setFalloCaptcha] = useState<string | undefined>(undefined);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function alRecibirToken(nuevo: string | undefined) {
    setToken(nuevo);
    if (nuevo) setFalloCaptcha(undefined);
  }

  async function entrar() {
    setError(null);
    if (!CORREO_VALIDO.test(correo.trim())) return setError('Correo inválido');
    if (!password) return setError('La contraseña es obligatoria');
    if (clave && !token) return setError(MENSAJE_CAPTCHA_PENDIENTE);

    setEnviando(true);
    const { error: errorDeAuth } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password,
      options: { captchaToken: token },
    });
    captcha.current?.reiniciar(); // el token es de un solo uso
    setEnviando(false);
    if (errorDeAuth) setError(mensajeDeErrorAuth(errorDeAuth, 'login'));
    // Si salió bien, el layout raíz cambia solo a Inicio al recibir la sesión.
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.marca}>Korly</Text>
          <Text style={estilos.titulo}>Bienvenido de vuelta</Text>
          <Text style={estilos.descripcion}>Inicia sesión para ver cuánto puedes gastar hoy.</Text>

          <View style={estilos.campo}>
            <Text style={estilos.etiqueta}>Correo</Text>
            <TextInput
              value={correo}
              onChangeText={setCorreo}
              style={estilos.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              placeholderTextColor={colores.heroTextoTenue}
            />
          </View>
          <View style={estilos.campo}>
            <Text style={estilos.etiqueta}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={estilos.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => void entrar()}
            />
          </View>

          {clave && <CaptchaTurnstile ref={captcha} clave={clave} onToken={alRecibirToken} onFallo={setFalloCaptcha} fallo={falloCaptcha} />}
          {error && <Text style={estilos.error}>{error}</Text>}

          <Pressable onPress={() => void entrar()} disabled={enviando} style={({ pressed }) => [estilos.boton, (pressed || enviando) && { opacity: 0.8 }]}>
            {enviando ? <ActivityIndicator color={colores.doradoTexto} /> : <Text style={estilos.botonTexto}>Entrar</Text>}
          </Pressable>

          <Pressable onPress={() => void Linking.openURL('https://app.korly.com.mx/registro')}>
            <Text style={estilos.enlace}>¿No tienes cuenta? Regístrate en la web</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL('https://app.korly.com.mx/olvide-password')}>
            <Text style={estilos.enlace}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.hero },
  contenido: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  marca: { color: colores.dorado, fontSize: 22, fontWeight: '800' },
  titulo: { color: colores.heroTexto, fontSize: 26, fontWeight: '800', marginTop: 8 },
  descripcion: { color: colores.heroTextoTenue, fontSize: 15, marginBottom: 8 },
  campo: { gap: 6 },
  etiqueta: { color: colores.heroTexto, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#0b1614',
    color: colores.heroTexto,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: colores.heroRojo, fontSize: 14 },
  boton: { backgroundColor: colores.dorado, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  botonTexto: { color: colores.doradoTexto, fontSize: 16, fontWeight: '800' },
  enlace: { color: colores.heroTextoTenue, textAlign: 'center', fontSize: 14, paddingVertical: 4 },
});
