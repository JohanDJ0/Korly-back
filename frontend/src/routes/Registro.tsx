import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { BotonAuth } from '@/components/BotonAuth';
import { CaptchaDelFormulario } from '@/components/CaptchaDelFormulario';
import { CargandoKorly } from '@/components/CargandoKorly';
import { useTurnstile } from '@/hooks/use-turnstile';
import { constanciaDeAviso } from '@/lib/datos-responsable';
import { esquemaPasswordNueva } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { MENSAJE_CAPTCHA_PENDIENTE } from '@/lib/turnstile';
import { useAuthStore } from '@/stores/auth-store';

const esquemaRegistro = z
  .object({
    email: z.string().email('Correo inválido'),
    password: esquemaPasswordNueva,
    confirmarPassword: z.string().min(1, 'Confirma tu contraseña'),
    // Datos financieros = patrimoniales: consentimiento expreso, no tácito.
    aceptaAviso: z.boolean().refine((acepta) => acepta, { message: 'Debes aceptar los términos y el aviso de privacidad para crear tu cuenta' }),
  })
  .refine((datos) => datos.password === datos.confirmarPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmarPassword'],
  });

type RegistroForm = z.infer<typeof esquemaRegistro>;

/**
 * No toca el backend en absoluto: la identidad (usuario_id, tenant_id)
 * se aprovisiona sola en el primer request autenticado
 * (resolverOcrearIdentidad, backend). Este formulario solo crea la
 * cuenta en Supabase Auth.
 */
export function Registro() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cuentaCreada, setCuentaCreada] = useState(false);
  const captcha = useTurnstile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroForm>({ resolver: zodResolver(esquemaRegistro) });

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(datos: RegistroForm) {
    setErrorGeneral(null);
    if (captcha.activo && !captcha.token) {
      setErrorGeneral(MENSAJE_CAPTCHA_PENDIENTE);
      return;
    }
    // La versión y la fecha del aviso aceptado quedan en la cuenta como constancia del consentimiento.
    const { data, error } = await supabase.auth.signUp({
      email: datos.email,
      password: datos.password,
      options: { data: constanciaDeAviso(), captchaToken: captcha.token },
    });
    captcha.reiniciar(); // el token es de un solo uso
    if (error) {
      setErrorGeneral(error.message);
      return;
    }
    // Si el proyecto exige confirmar el correo, signUp() no da sesión
    // todavía — no hay nada más que hacer aquí que avisarle al usuario.
    if (data.session) {
      navigate('/', { replace: true });
      return;
    }
    setCuentaCreada(true);
  }

  if (cuentaCreada) {
    return (
      <AuthCard titulo="Revisa tu correo" descripcion="Te mandamos un enlace para confirmar tu cuenta antes de poder entrar.">
        <BotonAuth to="/login" variante="oscuro">
          Volver a iniciar sesión
        </BotonAuth>
      </AuthCard>
    );
  }

  return (
    <AuthCard titulo="Crea tu cuenta" descripcion="Regístrate para empezar a ver cuánto puedes gastar hoy." sinPieLegal>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" className="auth-input" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="new-password" className="auth-input" {...register('password')} />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmarPassword">Confirma tu contraseña</Label>
          <Input id="confirmarPassword" type="password" autoComplete="new-password" className="auth-input" {...register('confirmarPassword')} />
          {errors.confirmarPassword && <p className="text-destructive text-sm">{errors.confirmarPassword.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-2.5 text-[13px] leading-snug">
            <input type="checkbox" className="accent-primary mt-0.5 h-4 w-4 shrink-0" {...register('aceptaAviso')} />
            <span>
              He leído y acepto los{' '}
              <Link to="/terminos" target="_blank" className="text-primary font-medium underline-offset-4 hover:underline">
                Términos y condiciones
              </Link>{' '}
              y el{' '}
              <Link to="/privacidad" target="_blank" className="text-primary font-medium underline-offset-4 hover:underline">
                Aviso de privacidad
              </Link>
              , incluido el tratamiento de mis datos financieros.
            </span>
          </label>
          {errors.aceptaAviso && <p className="text-destructive text-sm">{errors.aceptaAviso.message}</p>}
        </div>
        <CaptchaDelFormulario captcha={captcha} />
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <BotonAuth type="submit" disabled={isSubmitting}>
          {isSubmitting && <CargandoKorly tamano={22} etiqueta="Creando cuenta" className="text-[#3b2a00]" />}
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </BotonAuth>
        <p className="text-muted-foreground text-center text-sm">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-primary font-medium underline-offset-4 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
