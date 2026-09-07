import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

const esquemaLogin = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type LoginForm = z.infer<typeof esquemaLogin>;

/**
 * Sin registro público todavía (ver README del frontend, "Qué falta") —
 * los usuarios de prueba se crean a mano en el dashboard de Supabase,
 * igual que se ha probado el backend hasta ahora.
 */
export function Login() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

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
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Korly</CardTitle>
          <CardDescription>Inicia sesión para ver cuánto puedes gastar hoy.</CardDescription>
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
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {errorGeneral && <p className="text-sm text-destructive">{errorGeneral}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
