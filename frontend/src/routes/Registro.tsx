import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Revisa tu correo</CardTitle>
            <CardDescription>Te mandamos un enlace para confirmar tu cuenta antes de poder entrar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Volver a iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crea tu cuenta</CardTitle>
          <CardDescription>Registro para empezar a ver cuánto puedes gastar hoy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmarPassword">Confirma tu contraseña</Label>
              <Input id="confirmarPassword" type="password" autoComplete="new-password" {...register('confirmarPassword')} />
              {errors.confirmarPassword && <p className="text-sm text-destructive">{errors.confirmarPassword.message}</p>}
            </div>
            {errorGeneral && <p className="text-sm text-destructive">{errorGeneral}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Inicia sesión
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
