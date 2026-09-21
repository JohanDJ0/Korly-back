import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/AuthCard';
import { supabase } from '@/lib/supabase';

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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OlvideForm>({ resolver: zodResolver(esquemaOlvide) });

  async function onSubmit(datos: OlvideForm) {
    setErrorGeneral(null);
    const { error } = await supabase.auth.resetPasswordForEmail(datos.email, { redirectTo: window.location.origin });
    if (error) {
      setErrorGeneral(error.message);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <AuthCard titulo="Revisa tu correo" descripcion="Si ese correo tiene una cuenta, te mandamos un enlace para poner una contraseña nueva.">
        <Button asChild variant="outline" className="h-11 w-full rounded-xl">
          <Link to="/login">Volver a iniciar sesión</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard titulo="¿Olvidaste tu contraseña?" descripcion="Te mandamos un enlace a tu correo para poner una nueva.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus className="h-11 rounded-xl" {...register('email')} />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>
        {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
        <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl">
          {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          <Link to="/login" className="text-primary font-medium underline-offset-4 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
