import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

const esquemaRegistro = z
  .object({
    email: z.string().email('Correo inválido'),
    password: z.string().min(6, 'La contraseña necesita al menos 6 caracteres'),
    confirmarPassword: z.string().min(1, 'Confirma tu contraseña'),
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroForm>({ resolver: zodResolver(esquemaRegistro) });

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(datos: RegistroForm) {
    setErrorGeneral(null);
    const { data, error } = await supabase.auth.signUp({ email: datos.email, password: datos.password });
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
        <Button asChild variant="outline" className="h-11 w-full rounded-xl">
          <Link to="/login">Volver a iniciar sesión</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard titulo="Crea tu cuenta" descripcion="Regístrate para empezar a ver cuánto puedes gastar hoy.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" className="h-11 rounded-xl" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="new-password" className="h-11 rounded-xl" {...register('password')} />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmarPassword">Confirma tu contraseña</Label>
          <Input id="confirmarPassword" type="password" autoComplete="new-password" className="h-11 rounded-xl" {...register('confirmarPassword')} />
          {errors.confirmarPassword && <p className="text-destructive text-sm">{errors.confirmarPassword.message}</p>}
        </div>
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl">
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
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
