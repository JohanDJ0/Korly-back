import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrearMeta } from '@/hooks/use-crear-meta';

const esquemaMeta = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre a tu meta'),
  montoObjetivo: z.coerce.number().positive('El objetivo debe ser mayor a cero'),
});

// Mismo motivo que FormularioGasto.tsx: z.coerce separa el tipo de
// entrada (string del <input>) del de salida (number validado).
type MetaFormEntrada = z.input<typeof esquemaMeta>;
type MetaFormSalida = z.output<typeof esquemaMeta>;

interface FormularioMetaProps {
  onCreada?: () => void;
  /** Ver el comentario en FormularioGasto.tsx — mismo hallazgo real, mismo criterio. */
  onCancelar?: () => void;
}

export function FormularioMeta({ onCreada, onCancelar }: FormularioMetaProps) {
  const crearMeta = useCrearMeta();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MetaFormEntrada, unknown, MetaFormSalida>({ resolver: zodResolver(esquemaMeta) });

  function onSubmit(datos: MetaFormSalida) {
    crearMeta.mutate(
      { nombre: datos.nombre, montoObjetivo: { valorMinimo: Math.round(datos.montoObjetivo * 100), moneda: 'MXN' } },
      {
        onSuccess: () => {
          reset();
          onCreada?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre-meta">¿Para qué estás ahorrando?</Label>
        <Input id="nombre-meta" autoFocus {...register('nombre')} />
        {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="objetivo-meta">Objetivo</Label>
        <Input id="objetivo-meta" type="number" step="0.01" min="0" inputMode="decimal" {...register('montoObjetivo')} />
        {errors.montoObjetivo && <p className="text-sm text-destructive">{errors.montoObjetivo.message}</p>}
      </div>
      {crearMeta.isError && <p className="text-sm text-destructive">{crearMeta.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={crearMeta.isPending}>
          {crearMeta.isPending ? 'Creando…' : 'Crear meta'}
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
