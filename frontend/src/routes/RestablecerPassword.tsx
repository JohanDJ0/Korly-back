import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { limpiarRecuperacion } from '@/stores/auth-store';

const esquemaRestablecer = z
  .object({
    password: z.string().min(6, 'La contraseña necesita al menos 6 caracteres'),
    confirmarPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((datos) => datos.password === datos.confirmarPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmarPassword'],
  });

type RestablecerForm = z.infer<typeof esquemaRestablecer>;

/**
 * Se muestra en vez de la app normal mientras `esRecuperacion` es true
 * (ver App.tsx) — la sesión que ya existe en este punto viene del link
 * de "olvidé mi contraseña" (evento `PASSWORD_RECOVERY`, Supabase ya
 * dejó al usuario autenticado con ella), así que `updateUser` alcanza
 * para cambiar la contraseña sin pedir la anterior.
 */
export function RestablecerPassword() {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RestablecerForm>({ resolver: zodResolver(esquemaRestablecer) });

  async function onSubmit(datos: RestablecerForm) {
    setErrorGeneral(null);
    const { error } = await supabase.auth.updateUser({ password: datos.password });
    if (error) {
      setErrorGeneral(error.message);
      return;
    }
    limpiarRecuperacion();
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <img src="/logo/full.svg" alt="Korly" className="mx-auto mb-2 h-9" />
          <CardTitle>Elige una nueva contraseña</CardTitle>
          <CardDescription>Este cambio aplica de inmediato — después de guardar, entras directo con la nueva.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña nueva</Label>
              <Input id="password" type="password" autoComplete="new-password" autoFocus {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmarPassword">Confírmala</Label>
              <Input id="confirmarPassword" type="password" autoComplete="new-password" {...register('confirmarPassword')} />
              {errors.confirmarPassword && <p className="text-sm text-destructive">{errors.confirmarPassword.message}</p>}
            </div>
            {errorGeneral && <p className="text-sm text-destructive">{errorGeneral}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
