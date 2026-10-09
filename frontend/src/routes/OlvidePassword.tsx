import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { BotonAuth } from '@/components/BotonAuth';
import { CaptchaDelFormulario } from '@/components/CaptchaDelFormulario';
import { CargandoKorly } from '@/components/CargandoKorly';
import { useTurnstile } from '@/hooks/use-turnstile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { supabase } from '@/lib/supabase';
import { MENSAJE_CAPTCHA_PENDIENTE } from '@/lib/turnstile';

const esquemaOlvide = z.object({
  email: z.string().email('Correo inválido'),
});

type OlvideForm = z.infer<typeof esquemaOlvide>;

/**
 * Hallazgo real: la configuración por defecto de "Site URL" en Supabase
 * mandaba el link de recuperación al puerto del BACKEND (3000), no al
 * frontend (5173) — un 404 sin ninguna pantalla que lo manejara. Pasar
 * `redirectTo: window.location.origin` explícito aquí es la corrección
 * robusta: apunta siempre a donde de verdad corre el frontend (5173 en
 * desarrollo, el dominio real una vez desplegado), sin depender de que
 * la configuración del dashboard de Supabase esté bien puesta — aunque
 * esa URL igual necesita estar en la lista de "Redirect URLs" del
 * proyecto de Supabase la primera vez, o Supabase la rechaza.
 */
export function OlvidePassword() {
  const [enviado, setEnviado] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const captcha = useTurnstile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OlvideForm>({ resolver: zodResolver(esquemaOlvide) });

  async function onSubmit(datos: OlvideForm) {
    setErrorGeneral(null);
    if (captcha.activo && !captcha.token) {
      setErrorGeneral(MENSAJE_CAPTCHA_PENDIENTE);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(datos.email, { redirectTo: window.location.origin, captchaToken: captcha.token });
    captcha.reiniciar(); // el token es de un solo uso
    if (error) {
      setErrorGeneral(error.message);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <AuthCard titulo="Revisa tu correo" descripcion="Si ese correo tiene una cuenta, te mandamos un enlace para poner una contraseña nueva.">
        <BotonAuth to="/login" variante="oscuro">
          Volver a iniciar sesión
        </BotonAuth>
      </AuthCard>
    );
  }

  return (
    <AuthCard titulo="¿Olvidaste tu contraseña?" descripcion="Te mandamos un enlace a tu correo para poner una nueva.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus className="auth-input" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <CaptchaDelFormulario captcha={captcha} />
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <BotonAuth type="submit" disabled={isSubmitting}>
          {isSubmitting && <CargandoKorly tamano={22} etiqueta="Enviando" className="text-[#3b2a00]" />}
          {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
        </BotonAuth>
        <p className="text-muted-foreground text-center text-sm">
          <Link to="/login" className="text-primary font-medium underline-offset-4 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
