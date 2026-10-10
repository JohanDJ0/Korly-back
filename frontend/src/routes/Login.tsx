import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { BotonAuth } from '@/components/BotonAuth';
import { CaptchaDelFormulario } from '@/components/CaptchaDelFormulario';
import { CargandoKorly } from '@/components/CargandoKorly';
import { useTurnstile } from '@/hooks/use-turnstile';
import { destinoTrasLogin } from '@/lib/destino-tras-login';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { hayAvisoSesionExpirada, limpiarAvisoSesionExpirada } from '@/lib/sesion-expirada';
import { supabase } from '@/lib/supabase';
import { MENSAJE_CAPTCHA_PENDIENTE } from '@/lib/turnstile';
import { useAuthStore } from '@/stores/auth-store';

const esquemaLogin = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type LoginForm = z.infer<typeof esquemaLogin>;

export function Login() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const destino = destinoTrasLogin(useLocation().state);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [sesionExpirada] = useState(hayAvisoSesionExpirada);
  const captcha = useTurnstile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(esquemaLogin) });

  if (session) return <Navigate to={destino} replace />;

  async function onSubmit(datos: LoginForm) {
    setErrorGeneral(null);
    if (captcha.activo && !captcha.token) {
      setErrorGeneral(MENSAJE_CAPTCHA_PENDIENTE);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ ...datos, options: { captchaToken: captcha.token } });
    captcha.reiniciar(); // el token es de un solo uso
    if (error) {
      setErrorGeneral(mensajeDeErrorAuth(error, 'login'));
      return;
    }
    limpiarAvisoSesionExpirada();
    navigate(destino, { replace: true });
  }

  return (
    <AuthCard titulo="Bienvenido de vuelta" descripcion="Inicia sesión para ver cuánto puedes gastar hoy.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" className="auth-input" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" className="auth-input" {...register('password')} />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
          <Link to="/olvide-password" className="text-muted-foreground self-end text-xs underline-offset-4 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {sesionExpirada && !errorGeneral && (
          <p role="status" className="text-muted-foreground bg-muted rounded-xl px-3 py-2 text-sm">
            Tu sesión expiró. Inicia sesión de nuevo para continuar.
          </p>
        )}
        <CaptchaDelFormulario captcha={captcha} />
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <BotonAuth type="submit" disabled={isSubmitting}>
          {isSubmitting && <CargandoKorly tamano={22} etiqueta="Entrando" className="text-[#3b2a00]" />}
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </BotonAuth>
        <p className="text-muted-foreground text-center text-sm">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="text-primary font-medium underline-offset-4 hover:underline">
            Regístrate
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
