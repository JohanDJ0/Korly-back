import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrearTarjeta } from '@/hooks/use-crear-tarjeta';

const esquemaTarjeta = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre (p. ej. 'BBVA Oro')"),
  limiteCredito: z.coerce.number().positive('El límite debe ser mayor a cero'),
  diaCorte: z.coerce.number().int().min(1, 'Debe estar entre 1 y 31').max(31, 'Debe estar entre 1 y 31'),
  diasParaPago: z.coerce.number().int().positive('Debe ser un número positivo de días'),
});

// Mismo motivo que el resto de formularios: z.coerce separa el tipo de
// entrada (strings de los <input>) del de salida (números validados).
type TarjetaFormEntrada = z.input<typeof esquemaTarjeta>;
type TarjetaFormSalida = z.output<typeof esquemaTarjeta>;

interface FormularioTarjetaProps {
  onCreada?: () => void;
  /** Ver el comentario en FormularioGasto.tsx — mismo hallazgo real, mismo criterio. */
  onCancelar?: () => void;
}

export function FormularioTarjeta({ onCreada, onCancelar }: FormularioTarjetaProps) {
  const crearTarjeta = useCrearTarjeta();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TarjetaFormEntrada, unknown, TarjetaFormSalida>({
    resolver: zodResolver(esquemaTarjeta),
    defaultValues: { diasParaPago: 20 },
  });

  function onSubmit(datos: TarjetaFormSalida) {
    crearTarjeta.mutate(
      {
        nombre: datos.nombre,
        limiteCredito: { valorMinimo: Math.round(datos.limiteCredito * 100), moneda: 'MXN' },
        diaCorte: datos.diaCorte,
        diasParaPago: datos.diasParaPago,
      },
      {
        onSuccess: () => {
          reset({ diasParaPago: 20 });
          onCreada?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre-tarjeta">Nombre</Label>
        <Input id="nombre-tarjeta" placeholder="BBVA Oro, Santander Platino…" autoFocus {...register('nombre')} />
        {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="limite-tarjeta">Límite de crédito</Label>
        <Input id="limite-tarjeta" type="number" step="0.01" min="0" inputMode="decimal" {...register('limiteCredito')} />
        {errors.limiteCredito && <p className="text-sm text-destructive">{errors.limiteCredito.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dia-corte-tarjeta">Día de corte</Label>
        <Input id="dia-corte-tarjeta" type="number" min="1" max="31" inputMode="numeric" {...register('diaCorte')} />
        {errors.diaCorte && <p className="text-sm text-destructive">{errors.diaCorte.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dias-pago-tarjeta">Días para pagar después del corte</Label>
        <Input id="dias-pago-tarjeta" type="number" min="1" inputMode="numeric" {...register('diasParaPago')} />
        {errors.diasParaPago && <p className="text-sm text-destructive">{errors.diasParaPago.message}</p>}
      </div>

      {crearTarjeta.isError && <p className="text-sm text-destructive">{crearTarjeta.error.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={crearTarjeta.isPending}>
          {crearTarjeta.isPending ? 'Guardando…' : 'Guardar'}
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
