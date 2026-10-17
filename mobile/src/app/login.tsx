import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { BotonAcceso, CampoAcceso, CORREO_VALIDO, EnlaceAcceso, ErrorAcceso, PantallaAcceso } from '@/components/Acceso';
import { MENSAJE_CAPTCHA_PENDIENTE, useCaptcha } from '@/components/CaptchaTurnstile';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { haySesionExpirada, limpiarSesionExpirada } from '@/lib/sesion-expirada';
import { supabase } from '@/lib/supabase';

/** Mismo flujo que frontend/src/routes/Login.tsx: correo + contraseña a Supabase con el token del captcha; errores en español. */
export default function Login() {
  const captcha = useCaptcha();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [sesionExpirada] = useState(haySesionExpirada);

  async function entrar() {
    setError(null);
    if (!CORREO_VALIDO.test(correo.trim())) return setError('Correo inválido');
    if (!password) return setError('La contraseña es obligatoria');
    if (captcha.activo && !captcha.token) return setError(MENSAJE_CAPTCHA_PENDIENTE);

    setEnviando(true);
    const { error: errorDeAuth } = await supabase.auth.signInWithPassword({ email: correo.trim(), password, options: { captchaToken: captcha.token } });
    captcha.reiniciar(); // el token es de un solo uso
    setEnviando(false);
    if (errorDeAuth) return setError(mensajeDeErrorAuth(errorDeAuth, 'login'));
    limpiarSesionExpirada();
    // Si salió bien, el layout raíz cambia solo a la app al recibir la sesión.
  }

  return (
    <PantallaAcceso titulo="Bienvenido de vuelta" descripcion="Inicia sesión para ver cuánto puedes gastar hoy.">
      <CampoAcceso etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <CampoAcceso etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={() => void entrar()} />
      <EnlaceAcceso onPress={() => router.push('/olvide-password')}>¿Olvidaste tu contraseña?</EnlaceAcceso>
      {sesionExpirada && !error && (
        <Text style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 }}>Tu sesión expiró. Inicia sesión de nuevo para continuar.</Text>
      )}
      {captcha.elemento}
      {error && <ErrorAcceso>{error}</ErrorAcceso>}
      <BotonAcceso onPress={() => void entrar()} cargando={enviando}>
        Entrar
      </BotonAcceso>
      <EnlaceAcceso onPress={() => router.push('/registro')}>¿No tienes cuenta? Regístrate</EnlaceAcceso>
    </PantallaAcceso>
  );
}
