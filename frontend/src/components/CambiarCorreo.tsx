import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { traducirErrorDeAuth } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

const esquema = z.object({
  nuevoCorreo: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

type Formulario = z.infer<typeof esquema>;

/**
 * Cambiar el correo de la cuenta. Pide la contraseña (misma razón que
 * CambiarPassword) y NO cambia nada al instante: Supabase manda un enlace de
 * confirmación y el correo solo cambia cuando se confirma (con "Secure email
 * change" activo, desde el correo actual y desde el nuevo). La cuenta de
 * Korly no depende del correo —se identifica por el id de Supabase—, así que
 * los datos y el plan se quedan donde están.
 */
export function CambiarCorreo() {
  const correoActual = useAuthStore((s) => s.session?.user.email);
  const [abierto, setAbierto] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  function cerrar() {
    setAbierto(false);
    setErrorGeneral(null);
    reset();
  }

  async function onSubmit(datos: Formulario) {
    setErrorGeneral(null);
    setEnviadoA(null);
    if (!correoActual) {
      setErrorGeneral('No se pudo identificar tu cuenta. Vuelve a iniciar sesión.');
      return;
    }
    if (datos.nuevoCorreo.trim().toLowerCase() === correoActual.toLowerCase()) {
      setErrorGeneral('Ese ya es el correo de tu cuenta');
      return;
    }

    const verificacion = await supabase.auth.signInWithPassword({ email: correoActual, password: datos.password });
    if (verificacion.error) {
      setErrorGeneral(traducirErrorDeAuth(verificacion.error.message));
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: datos.nuevoCorreo.trim() }, { emailRedirectTo: window.location.origin });
    if (error) {
      setErrorGeneral(traducirErrorDeAuth(error.message));
      return;
    }
    const destino = datos.nuevoCorreo.trim();
    cerrar();
    setEnviadoA(destino);
  }

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" className="h-10 w-full rounded-xl" onClick={() => setAbierto(true)}>
          Cambiar correo
        </Button>
        {enviadoA && (
          <p role="status" className="bg-secondary text-secondary-foreground rounded-xl px-3.5 py-2.5 text-[13px]">
            Te enviamos un enlace de confirmación a tu correo actual y a {enviadoA}. El cambio se aplica cuando confirmes.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Correo nuevo
        <Input type="email" autoComplete="email" className="h-10 rounded-xl" {...register('nuevoCorreo')} />
        {errors.nuevoCorreo && <span className="text-destructive text-sm">{errors.nuevoCorreo.message}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Tu contraseña
        <Input type="password" autoComplete="current-password" className="h-10 rounded-xl" {...register('password')} />
        {errors.password && <span className="text-destructive text-sm">{errors.password.message}</span>}
      </label>
      {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="h-10 flex-1 rounded-xl" disabled={isSubmitting}>
          {isSubmitting ? 'Enviando…' : 'Enviar enlace de confirmación'}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" disabled={isSubmitting} onClick={cerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
