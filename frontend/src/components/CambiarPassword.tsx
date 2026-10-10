import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CaptchaDelFormulario } from '@/components/CaptchaDelFormulario';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTurnstile } from '@/hooks/use-turnstile';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { esquemaPasswordNueva } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { MENSAJE_CAPTCHA_PENDIENTE } from '@/lib/turnstile';
import { useAuthStore } from '@/stores/auth-store';

const esquema = z
  .object({
    actual: z.string().min(1, 'Escribe tu contraseña actual'),
    nueva: esquemaPasswordNueva,
    confirmar: z.string().min(1, 'Confirma tu contraseña nueva'),
  })
  .refine((datos) => datos.nueva === datos.confirmar, { message: 'Las contraseñas no coinciden', path: ['confirmar'] });

type Formulario = z.infer<typeof esquema>;

/**
 * Cambiar la contraseña estando dentro. Pide la actual y la comprueba contra
 * Supabase antes de cambiarla (volver a iniciar sesión con ella): así alguien
 * que se encuentre una sesión abierta no puede quedarse con la cuenta. El
 * flujo de "olvidé mi contraseña" (RestablecerPassword) es otro: ahí no hay
 * contraseña actual que pedir.
 */
export function CambiarPassword() {
  const correo = useAuthStore((s) => s.session?.user.email);
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // Comprobar la contraseña actual es iniciar sesión otra vez, y con el captcha encendido Supabase también lo exige ahí.
  const captcha = useTurnstile(abierto);

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
    setListo(false);
    if (!correo) {
      setErrorGeneral('No se pudo identificar tu cuenta. Vuelve a iniciar sesión.');
      return;
    }

    if (captcha.activo && !captcha.token) {
      setErrorGeneral(MENSAJE_CAPTCHA_PENDIENTE);
      return;
    }

    const verificacion = await supabase.auth.signInWithPassword({ email: correo, password: datos.actual, options: { captchaToken: captcha.token } });
    captcha.reiniciar(); // el token es de un solo uso
    if (verificacion.error) {
      setErrorGeneral(mensajeDeErrorAuth(verificacion.error, 'reautenticar'));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: datos.nueva });
    if (error) {
      setErrorGeneral(mensajeDeErrorAuth(error));
      return;
    }
    cerrar();
    setListo(true);
  }

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" className="h-10 w-full rounded-xl" onClick={() => setAbierto(true)}>
          Cambiar contraseña
        </Button>
        {listo && (
          <p role="status" className="bg-secondary text-secondary-foreground rounded-xl px-3.5 py-2.5 text-[13px]">
            Listo — tu contraseña se actualizó.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Contraseña actual
        <Input type="password" autoComplete="current-password" className="h-10 rounded-xl" {...register('actual')} />
        {errors.actual && <span className="text-destructive text-sm">{errors.actual.message}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Contraseña nueva
        <Input type="password" autoComplete="new-password" className="h-10 rounded-xl" {...register('nueva')} />
        {errors.nueva && <span className="text-destructive text-sm">{errors.nueva.message}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px]">
        Confirma la contraseña nueva
        <Input type="password" autoComplete="new-password" className="h-10 rounded-xl" {...register('confirmar')} />
        {errors.confirmar && <span className="text-destructive text-sm">{errors.confirmar.message}</span>}
      </label>
      <CaptchaDelFormulario captcha={captcha} />
      {errorGeneral && <p className="text-destructive text-sm">{errorGeneral}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="h-10 flex-1 rounded-xl" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" disabled={isSubmitting} onClick={cerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
