import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { BotonAcceso, CampoAcceso, CORREO_VALIDO, EnlaceAcceso, ErrorAcceso, LONGITUD_MINIMA_PASSWORD, PantallaAcceso } from '@/components/Acceso';
import { MENSAJE_CAPTCHA_PENDIENTE, useCaptcha } from '@/components/CaptchaTurnstile';
import { constanciaDeAviso, URL_AVISO_PRIVACIDAD, URL_TERMINOS } from '@/lib/aviso';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';
import { colores } from '@/lib/tema';

/**
 * Igual que frontend/src/routes/Registro.tsx: solo crea la cuenta en Supabase Auth (la identidad en el backend se crea sola
 * en el primer request). El consentimiento es expreso (datos financieros) y su versión y fecha quedan en la cuenta.
 */
export default function Registro() {
  const captcha = useCaptcha();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<{ correo?: string; password?: string; confirmacion?: string; acepta?: string }>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cuentaCreada, setCuentaCreada] = useState(false);

  async function crear() {
    setErrorGeneral(null);
    const nuevos = {
      correo: !CORREO_VALIDO.test(correo.trim()) ? 'Correo inválido' : undefined,
      password: password.length < LONGITUD_MINIMA_PASSWORD ? `La contraseña necesita al menos ${LONGITUD_MINIMA_PASSWORD} caracteres` : undefined,
      confirmacion: !confirmacion ? 'Confirma tu contraseña' : confirmacion !== password ? 'Las contraseñas no coinciden' : undefined,
      acepta: !acepta ? 'Debes aceptar los términos y el aviso de privacidad para crear tu cuenta' : undefined,
    };
    setErrores(nuevos);
    if (Object.values(nuevos).some(Boolean)) return;
    if (captcha.activo && !captcha.token) return setErrorGeneral(MENSAJE_CAPTCHA_PENDIENTE);

    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({ email: correo.trim(), password, options: { data: constanciaDeAviso(), captchaToken: captcha.token } });
    captcha.reiniciar();
    setEnviando(false);
    if (error) return setErrorGeneral(mensajeDeErrorAuth(error));
    // Si el proyecto exige confirmar el correo, signUp() no da sesión todavía. Con sesión, el layout entra solo.
    if (!data.session) setCuentaCreada(true);
  }

  if (cuentaCreada) {
    return (
      <PantallaAcceso titulo="Revisa tu correo" descripcion="Te mandamos un enlace para confirmar tu cuenta antes de poder entrar. Después de confirmarla, vuelve aquí e inicia sesión.">
        <BotonAcceso variante="plano" onPress={() => router.replace('/login')}>
          Volver a iniciar sesión
        </BotonAcceso>
      </PantallaAcceso>
    );
  }

  return (
    <PantallaAcceso titulo="Crea tu cuenta" descripcion="Regístrate para empezar a ver cuánto puedes gastar hoy.">
      <CampoAcceso etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoComplete="email" error={errores.correo} />
      <CampoAcceso etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={errores.password} />
      <CampoAcceso etiqueta="Confirma tu contraseña" value={confirmacion} onChangeText={setConfirmacion} secureTextEntry autoComplete="new-password" error={errores.confirmacion} />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Pressable
            onPress={() => setAcepta((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acepta }}
            accessibilityLabel="Acepto los términos y el aviso de privacidad"
            hitSlop={8}
            style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colores.dorado, backgroundColor: acepta ? colores.dorado : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}
          >
            {acepta && <Check size={15} color={colores.doradoTexto} strokeWidth={3} />}
          </Pressable>
          <Text style={{ flex: 1, color: colores.heroTexto, fontSize: 13, lineHeight: 19 }}>
            He leído y acepto los{' '}
            <Text style={{ color: colores.dorado, fontWeight: '700' }} onPress={() => void Linking.openURL(URL_TERMINOS)}>
              Términos y condiciones
            </Text>{' '}
            y el{' '}
            <Text style={{ color: colores.dorado, fontWeight: '700' }} onPress={() => void Linking.openURL(URL_AVISO_PRIVACIDAD)}>
              Aviso de privacidad
            </Text>
            , incluido el tratamiento de mis datos financieros.
          </Text>
        </View>
        {errores.acepta && <ErrorAcceso>{errores.acepta}</ErrorAcceso>}
      </View>
      {captcha.elemento}
      {errorGeneral && <ErrorAcceso>{errorGeneral}</ErrorAcceso>}
      <BotonAcceso onPress={() => void crear()} cargando={enviando}>
        Crear cuenta
      </BotonAcceso>
      <EnlaceAcceso onPress={() => router.replace('/login')}>¿Ya tienes cuenta? Inicia sesión</EnlaceAcceso>
    </PantallaAcceso>
  );
}
