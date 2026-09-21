import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';
import { hoyISO } from '@/lib/fechas';

const esquemaGasto = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
  fechaEfectiva: z.string().min(1, 'Selecciona una fecha'),
  nota: z.string().optional(),
});

// Ver el mismo comentario en FormularioIngreso.tsx: z.coerce separa el
// tipo de entrada (string del <input>) del de salida (number validado).
type GastoFormEntrada = z.input<typeof esquemaGasto>;
type GastoFormSalida = z.output<typeof esquemaGasto>;

interface FormularioGastoProps {
  periodoId: string;
  /** Se llama tras registrar con éxito — Home.tsx lo usa para cerrar la hoja inferior. */
  onRegistrado?: () => void;
}

/**
 * Mismo criterio de "≤2 toques" que FormularioIngreso.tsx: monto es el
 * único campo que el usuario normalmente toca — es el evento de mayor
 * frecuencia del sistema (modelo-dominio.md §4), cualquier fricción
 * aquí se paga muchas veces al día. Vive dentro de un HojaInferior.tsx
 * (Home.tsx) — ese wrapper ya da una forma de cerrar sin registrar
 * (backdrop, X, Escape), así que este formulario no repite su propio
 * botón "Cancelar".
 */
export function FormularioGasto({ periodoId, onRegistrado }: FormularioGastoProps) {
  const registrarGasto = useRegistrarGasto();
  const [categoriaId, setCategoriaId] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<GastoFormEntrada, unknown, GastoFormSalida>({
    resolver: zodResolver(esquemaGasto),
    defaultValues: { fechaEfectiva: hoyISO() },
  });
  const montoEnVivo = useWatch({ control, name: 'monto' });
  const montoValido = Number(montoEnVivo);

  function onSubmit(datos: GastoFormSalida) {
    registrarGasto.mutate(
      {
        periodoId,
        monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
        fechaEfectiva: datos.fechaEfectiva,
        categoriaId: categoriaId || undefined,
        nota: datos.nota || undefined,
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div className="border-border flex flex-col items-center gap-1 border-b pb-4">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-muted-foreground/60 text-3xl font-bold">$</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            autoFocus
            placeholder="0.00"
            aria-label="¿Cuánto gastaste?"
            {...register('monto')}
            className="font-display h-auto w-48 border-none p-0 text-center text-[44px] leading-none font-extrabold shadow-none focus-visible:ring-0"
          />
        </div>
        {errors.monto && <p className="text-destructive text-sm">{errors.monto.message}</p>}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">CATEGORÍA</Label>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="fecha-gasto" className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">
          FECHA
        </Label>
        <div className="relative">
          <Calendar size={17} className="text-primary pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2" />
          <Input id="fecha-gasto" type="date" {...register('fechaEfectiva')} className="h-auto rounded-2xl py-3 pl-10 text-[14px] font-medium" />
        </div>
        {errors.fechaEfectiva && <p className="text-destructive text-sm">{errors.fechaEfectiva.message}</p>}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="nota-gasto" className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">
          NOTA (OPCIONAL)
        </Label>
        <Input id="nota-gasto" placeholder="p. ej. comida con el equipo" {...register('nota')} className="h-auto rounded-2xl py-3" />
      </div>

      {registrarGasto.isError && <p className="text-destructive text-sm">{registrarGasto.error.message}</p>}

      <Button type="submit" disabled={registrarGasto.isPending} className="h-auto rounded-2xl py-3.5 text-[15.5px] font-semibold">
        {registrarGasto.isPending
          ? 'Guardando…'
          : `Registrar${Number.isFinite(montoValido) && montoValido > 0 ? ` $${montoValido.toFixed(2)}` : ''}`}
      </Button>
    </form>
  );
}
