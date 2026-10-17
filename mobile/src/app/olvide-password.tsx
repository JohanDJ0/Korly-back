import { router } from 'expo-router';
import { useState } from 'react';

import { BotonAcceso, CampoAcceso, CORREO_VALIDO, EnlaceAcceso, ErrorAcceso, PantallaAcceso } from '@/components/Acceso';
import { MENSAJE_CAPTCHA_PENDIENTE, useCaptcha } from '@/components/CaptchaTurnstile';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';

/**
 * Igual que frontend/src/routes/OlvidePassword.tsx. El enlace del correo abre la web (app.korly.com.mx), donde se pone la
 * contraseña nueva; luego se entra a la app con ella. La app todavía no recibe enlaces.
 */
export default function OlvidePassword() {
  const captcha = useCaptcha();
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    setError(null);
    if (!CORREO_VALIDO.test(correo.trim())) return setError('Correo inválido');
    if (captcha.activo && !captcha.token) return setError(MENSAJE_CAPTCHA_PENDIENTE);
    setEnviando(true);
    const { error: errorDeAuth } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: 'https://app.korly.com.mx', captchaToken: captcha.token });
    captcha.reiniciar();
    setEnviando(false);
    if (errorDeAuth) return setError(mensajeDeErrorAuth(errorDeAuth));
    setEnviado(true);
  }

  if (enviado) {
    return (
      <PantallaAcceso titulo="Revisa tu correo" descripcion="Si ese correo tiene una cuenta, te mandamos un enlace para poner una contraseña nueva. Después vuelve aquí e inicia sesión con ella.">
        <BotonAcceso variante="plano" onPress={() => router.replace('/login')}>
          Volver a iniciar sesión
        </BotonAcceso>
      </PantallaAcceso>
    );
  }

  return (
    <PantallaAcceso titulo="¿Olvidaste tu contraseña?" descripcion="Te mandamos un enlace a tu correo para poner una nueva.">
      <CampoAcceso etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoComplete="email" autoFocus />
      {captcha.elemento}
      {error && <ErrorAcceso>{error}</ErrorAcceso>}
      <BotonAcceso onPress={() => void enviar()} cargando={enviando}>
        Enviar enlace
      </BotonAcceso>
      <EnlaceAcceso onPress={() => router.replace('/login')}>Volver a iniciar sesión</EnlaceAcceso>
    </PantallaAcceso>
  );
}
