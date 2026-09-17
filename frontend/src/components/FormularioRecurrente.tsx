import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoria } from '@/components/SelectorCategoria';
import { useCrearRecurrente } from '@/hooks/use-crear-recurrente';

const esquemaRecurrente = z
  .object({
    descripcion: z.string().trim().min(1, "Ponle un nombre (p. ej. 'Netflix')"),
    monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
    frecuencia: z.enum(['quincenal', 'mensual']),
    diaMes: z.coerce.number().int().min(1).max(31).optional(),
  })
  .refine((datos) => datos.frecuencia !== 'mensual' || datos.diaMes !== undefined, {
    message: 'Indica el día del mes en que se cobra',
    path: ['diaMes'],
  });

type RecurrenteFormEntrada = z.input<typeof esquemaRecurrente>;
type RecurrenteFormSalida = z.output<typeof esquemaRecurrente>;

interface FormularioRecurrenteProps {
  onCreado?: () => void;
  /** Ver el comentario en FormularioGasto.tsx — mismo hallazgo real, mismo criterio. */
  onCancelar?: () => void;
}

export function FormularioRecurrente({ onCreado, onCancelar }: FormularioRecurrenteProps) {
  const crearRecurrente = useCrearRecurrente();
  const [categoriaId, setCategoriaIdState] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RecurrenteFormEntrada, unknown, RecurrenteFormSalida>({
    resolver: zodResolver(esquemaRecurrente),
    defaultValues: { frecuencia: 'quincenal' },
  });

  const frecuencia = watch('frecuencia');

  function onSubmit(datos: RecurrenteFormSalida) {
    crearRecurrente.mutate(
      {
        descripcion: datos.descripcion,
        monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
        frecuencia: datos.frecuencia,
        diaMes: datos.frecuencia === 'mensual' ? datos.diaMes : undefined,
        categoriaId: categoriaId || undefined,
      },
      {
        onSuccess: () => {
          reset();
          setCategoriaIdState('');
          onCreado?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="descripcion-recurrente">Descripción</Label>
        <Input id="descripcion-recurrente" placeholder="Netflix, renta, gimnasio…" autoFocus {...register('descripcion')} />
        {errors.descripcion && <p className="text-sm text-destructive">{errors.descripcion.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="monto-recurrente">Monto</Label>
        <Input id="monto-recurrente" type="number" step="0.01" min="0" inputMode="decimal" {...register('monto')} />
        {errors.monto && <p className="text-sm text-destructive">{errors.monto.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="frecuencia-recurrente">Frecuencia</Label>
        <select
          id="frecuencia-recurrente"
          {...register('frecuencia')}
          className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
        >
          <option value="quincenal">Cada quincena</option>
          <option value="mensual">Una vez al mes</option>
        </select>
      </div>

      {frecuencia === 'mensual' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="dia-mes-recurrente">Día del mes en que se cobra</Label>
          <Input id="dia-mes-recurrente" type="number" min="1" max="31" inputMode="numeric" {...register('diaMes')} />
          {errors.diaMes && <p className="text-sm text-destructive">{errors.diaMes.message}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria-recurrente">Categoría</Label>
        <SelectorCategoria id="categoria-recurrente" value={categoriaId} onChange={setCategoriaIdState} />
      </div>

      {crearRecurrente.isError && <p className="text-sm text-destructive">{crearRecurrente.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={crearRecurrente.isPending}>
          {crearRecurrente.isPending ? 'Guardando…' : 'Guardar'}
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
