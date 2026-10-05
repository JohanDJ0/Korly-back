import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { hayAvisoSesionExpirada, limpiarAvisoSesionExpirada } from '@/lib/sesion-expirada';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

const esquemaLogin = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type LoginForm = z.infer<typeof esquemaLogin>;

export function Login() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [sesionExpirada] = useState(hayAvisoSesionExpirada);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(esquemaLogin) });

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(datos: LoginForm) {
    setErrorGeneral(null);
    const { error } = await supabase.auth.signInWithPassword(datos);
    if (error) {
      setErrorGeneral(error.message);
      return;
    }
    limpiarAvisoSesionExpirada();
    navigate('/', { replace: true });
  }

  return (
    <AuthCard titulo="Bienvenido de vuelta" descripcion="Inicia sesión para ver cuánto puedes gastar hoy.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" className="h-11 rounded-xl" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" className="h-11 rounded-xl" {...register('password')} />
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
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl">
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="text-primary font-medium underline-offset-4 hover:underline">
            Regístrate
          </Link>
        </p>
        <p className="text-muted-foreground text-center text-xs">
          <Link to="/privacidad" className="underline-offset-4 hover:underline">
            Aviso de privacidad
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
