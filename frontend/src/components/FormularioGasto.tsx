import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoria } from '@/components/SelectorCategoria';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';

const esquemaGasto = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
  fechaEfectiva: z.string().min(1, 'Selecciona una fecha'),
});

// Ver el mismo comentario en FormularioIngreso.tsx: z.coerce separa el
// tipo de entrada (string del <input>) del de salida (number validado).
type GastoFormEntrada = z.input<typeof esquemaGasto>;
type GastoFormSalida = z.output<typeof esquemaGasto>;

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormularioGastoProps {
  periodoId: string;
  /** Se llama tras registrar con éxito — Home.tsx lo usa para volver a colapsar el formulario. */
  onRegistrado?: () => void;
  /**
   * Hallazgo real de QA: sin esto, una vez abierto el formulario no
   * había forma de cerrarlo sin registrar un gasto de verdad — ni
   * siquiera recargando se evitaba, porque el estado vivía en el padre.
   * Mismo criterio que "Cancelar" en el modo de edición de FilaGasto.tsx.
   */
  onCancelar?: () => void;
}

/**
 * Mismo criterio de "≤2 toques" que FormularioIngreso.tsx: monto es el
 * único campo que el usuario normalmente toca, sin nota — es el evento
 * de mayor frecuencia del sistema (modelo-dominio.md §4), cualquier
 * fricción aquí se paga muchas veces al día.
 */
export function FormularioGasto({ periodoId, onRegistrado, onCancelar }: FormularioGastoProps) {
  const registrarGasto = useRegistrarGasto();
  const [categoriaId, setCategoriaId] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GastoFormEntrada, unknown, GastoFormSalida>({
    resolver: zodResolver(esquemaGasto),
    defaultValues: { fechaEfectiva: hoyISO() },
  });

  function onSubmit(datos: GastoFormSalida) {
    registrarGasto.mutate(
      {
        periodoId,
        monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
        fechaEfectiva: datos.fechaEfectiva,
        categoriaId: categoriaId || undefined,
      },
      {
        onSuccess: () => {
          reset({ fechaEfectiva: hoyISO() });
          setCategoriaId('');
          onRegistrado?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="monto-gasto">¿Cuánto gastaste?</Label>
        <Input id="monto-gasto" type="number" step="0.01" min="0" inputMode="decimal" autoFocus {...register('monto')} />
        {errors.monto && <p className="text-sm text-destructive">{errors.monto.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fecha-gasto">Fecha</Label>
        <Input id="fecha-gasto" type="date" {...register('fechaEfectiva')} />
        {errors.fechaEfectiva && <p className="text-sm text-destructive">{errors.fechaEfectiva.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria-gasto">Categoría (opcional)</Label>
        <SelectorCategoria id="categoria-gasto" value={categoriaId} onChange={setCategoriaId} />
      </div>
      {registrarGasto.isError && <p className="text-sm text-destructive">{registrarGasto.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={registrarGasto.isPending}>
          {registrarGasto.isPending ? 'Guardando…' : 'Registrar gasto'}
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
