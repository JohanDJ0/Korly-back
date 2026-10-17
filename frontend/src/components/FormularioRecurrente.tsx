import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoria } from '@/components/SelectorCategoria';
import { useActualizarRecurrente } from '@/hooks/use-actualizar-recurrente';
import { useCrearRecurrente } from '@/hooks/use-crear-recurrente';
import type { GastoRecurrente } from '@/hooks/use-recurrentes';

const esquemaRecurrente = z
  .object({
    descripcion: z.string().trim().min(1, "Ponle un nombre (p. ej. 'Netflix')"),
    monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
    frecuencia: z.enum(['quincenal', 'mensual']),
    // Un campo vacío llega como 0 (z.coerce), no como undefined: sin mensaje propio salía el de zod en inglés ("Too small").
    diaMes: z.coerce.number().int('Indica el día del mes en que se cobra (de 1 a 31)').min(1, 'Indica el día del mes en que se cobra (de 1 a 31)').max(31, 'Indica el día del mes en que se cobra (de 1 a 31)').optional(),
  })
  .refine((datos) => datos.frecuencia !== 'mensual' || datos.diaMes !== undefined, {
    message: 'Indica el día del mes en que se cobra',
    path: ['diaMes'],
  });

type RecurrenteFormEntrada = z.input<typeof esquemaRecurrente>;
type RecurrenteFormSalida = z.output<typeof esquemaRecurrente>;

interface FormularioRecurrenteProps {
  /** Con un recurrente se edita (todo precargado); sin él, se crea uno nuevo. */
  recurrente?: GastoRecurrente;
  onCreado?: () => void;
  /** Ver el comentario en FormularioGasto.tsx — mismo hallazgo real, mismo criterio. */
  onCancelar?: () => void;
}

/**
 * Crear o editar un gasto recurrente. Editar cambia la plantilla: aplica desde el próximo cobro y lo ya cobrado no cambia
 * (si hace falta, se corrige en Historial) — por eso el formulario lo dice al pie.
 */
export function FormularioRecurrente({ recurrente, onCreado, onCancelar }: FormularioRecurrenteProps) {
  const crearRecurrente = useCrearRecurrente();
  const actualizarRecurrente = useActualizarRecurrente();
  const mutacion = recurrente ? actualizarRecurrente : crearRecurrente;
  const [categoriaId, setCategoriaIdState] = useState(recurrente?.categoriaId ?? '');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RecurrenteFormEntrada, unknown, RecurrenteFormSalida>({
    resolver: zodResolver(esquemaRecurrente),
    defaultValues: recurrente
      ? { descripcion: recurrente.descripcion, monto: recurrente.monto.valorMinimo / 100, frecuencia: recurrente.frecuencia, diaMes: recurrente.diaMes ?? undefined }
      : { frecuencia: 'quincenal' },
  });

  const frecuencia = watch('frecuencia');

  function onSubmit(datos: RecurrenteFormSalida) {
    if (recurrente) {
      actualizarRecurrente.mutate(
        {
          recurrenteId: recurrente.id,
          descripcion: datos.descripcion,
          monto: { valorMinimo: Math.round(datos.monto * 100), moneda: recurrente.monto.moneda },
          frecuencia: datos.frecuencia,
          diaMes: datos.frecuencia === 'mensual' ? datos.diaMes : null,
          categoriaId: categoriaId || null,
        },
        { onSuccess: () => onCreado?.() }
      );
      return;
    }
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

      {recurrente && (
        <p className="text-muted-foreground text-[12.5px]">El cambio aplica desde el próximo cobro. Lo que ya se cobró no cambia; si hace falta, corrígelo en Historial.</p>
      )}
      {mutacion.isError && <p className="text-sm text-destructive">{mutacion.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={mutacion.isPending}>
          {mutacion.isPending ? 'Guardando…' : 'Guardar'}
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
