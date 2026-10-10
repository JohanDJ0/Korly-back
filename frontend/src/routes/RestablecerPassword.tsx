import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { BotonAuth } from '@/components/BotonAuth';
import { CargandoKorly } from '@/components/CargandoKorly';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { esquemaPasswordNueva } from '@/lib/password';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';
import { limpiarRecuperacion } from '@/stores/auth-store';

const esquemaRestablecer = z
  .object({
    password: esquemaPasswordNueva,
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
      setErrorGeneral(mensajeDeErrorAuth(error));
      return;
    }
    limpiarRecuperacion();
  }

  return (
    <AuthCard titulo="Elige una nueva contraseña" descripcion="Este cambio aplica de inmediato — después de guardar, entras directo con la nueva.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña nueva</Label>
          <Input id="password" type="password" autoComplete="new-password" autoFocus className="auth-input" {...register('password')} />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmarPassword">Confírmala</Label>
          <Input id="confirmarPassword" type="password" autoComplete="new-password" className="auth-input" {...register('confirmarPassword')} />
          {errors.confirmarPassword && <p className="text-destructive text-sm">{errors.confirmarPassword.message}</p>}
        </div>
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <BotonAuth type="submit" disabled={isSubmitting}>
          {isSubmitting && <CargandoKorly tamano={22} etiqueta="Guardando" className="text-[#3b2a00]" />}
          {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
        </BotonAuth>
      </form>
    </AuthCard>
  );
}
