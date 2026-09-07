import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegistrarIngreso } from '@/hooks/use-registrar-ingreso';

const esquemaIngreso = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
  fechaEfectiva: z.string().min(1, 'Selecciona una fecha'),
});

// z.coerce hace que el tipo de entrada (lo que llega del <input>, un
// string) difiera del de salida (number, ya validado) — react-hook-form
// necesita ambos por separado, no solo el de salida.
type IngresoFormEntrada = z.input<typeof esquemaIngreso>;
type IngresoFormSalida = z.output<typeof esquemaIngreso>;

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormularioIngresoProps {
  periodoId: string;
}

/**
 * Monto es el único campo que el usuario normalmente toca — la fecha
 * llega precargada con hoy (CLAUDE.md, "captura en ≤2 toques"). La
 * conversión pesos → centavos ocurre aquí, en el submit: es el único
 * lugar del frontend donde el usuario escribe dinero en formato humano
 * antes de que se convierta a la unidad mínima que espera el backend.
 */
export function FormularioIngreso({ periodoId }: FormularioIngresoProps) {
  const registrarIngreso = useRegistrarIngreso();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IngresoFormEntrada, unknown, IngresoFormSalida>({
    resolver: zodResolver(esquemaIngreso),
    defaultValues: { fechaEfectiva: hoyISO() },
  });

  function onSubmit(datos: IngresoFormSalida) {
    registrarIngreso.mutate({
      periodoId,
      monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
      fechaEfectiva: datos.fechaEfectiva,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="monto">¿Cuánto recibiste?</Label>
        <Input id="monto" type="number" step="0.01" min="0" inputMode="decimal" autoFocus {...register('monto')} />
        {errors.monto && <p className="text-sm text-destructive">{errors.monto.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fechaEfectiva">Fecha</Label>
        <Input id="fechaEfectiva" type="date" {...register('fechaEfectiva')} />
        {errors.fechaEfectiva && <p className="text-sm text-destructive">{errors.fechaEfectiva.message}</p>}
      </div>
      {registrarIngreso.isError && <p className="text-sm text-destructive">{registrarIngreso.error.message}</p>}
      <Button type="submit" disabled={registrarIngreso.isPending}>
        {registrarIngreso.isPending ? 'Guardando…' : 'Registrar ingreso'}
      </Button>
    </form>
  );
}
