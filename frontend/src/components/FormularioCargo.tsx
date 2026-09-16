import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoria } from '@/components/SelectorCategoria';
import { useRegistrarCargo } from '@/hooks/use-registrar-cargo';

const PLAZOS_MSI = [3, 6, 9, 12, 18] as const;

const esquemaCargo = z.object({
  descripcion: z.string().trim().min(1, "Descríbelo (p. ej. 'Laptop')"),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
});

type CargoFormEntrada = z.input<typeof esquemaCargo>;
type CargoFormSalida = z.output<typeof esquemaCargo>;

interface FormularioCargoProps {
  tarjetaId: string;
  onRegistrado?: () => void;
}

/**
 * `numeroPlazos` vive fuera de react-hook-form (no es un campo de texto
 * libre, es una elección entre "de contado" y los plazos de MSI que de
 * verdad ofrecen los bancos) — mismo criterio que `categoriaId` en
 * FormularioGasto.tsx.
 */
export function FormularioCargo({ tarjetaId, onRegistrado }: FormularioCargoProps) {
  const registrarCargo = useRegistrarCargo();
  const [numeroPlazos, setNumeroPlazos] = useState(1);
  const [categoriaId, setCategoriaId] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CargoFormEntrada, unknown, CargoFormSalida>({ resolver: zodResolver(esquemaCargo) });

  function onSubmit(datos: CargoFormSalida) {
    registrarCargo.mutate(
      {
        tarjetaId,
        descripcion: datos.descripcion,
        monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
        numeroPlazos,
        categoriaId: categoriaId || undefined,
      },
      {
        onSuccess: () => {
          reset();
          setNumeroPlazos(1);
          setCategoriaId('');
          onRegistrado?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="descripcion-cargo">¿Qué compraste?</Label>
        <Input id="descripcion-cargo" autoFocus {...register('descripcion')} />
        {errors.descripcion && <p className="text-sm text-destructive">{errors.descripcion.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="monto-cargo">Monto total</Label>
        <Input id="monto-cargo" type="number" step="0.01" min="0" inputMode="decimal" {...register('monto')} />
        {errors.monto && <p className="text-sm text-destructive">{errors.monto.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plazos-cargo">Plazo</Label>
        <select
          id="plazos-cargo"
          value={numeroPlazos}
          onChange={(evento) => setNumeroPlazos(Number(evento.target.value))}
          className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
        >
          <option value={1}>De contado (1 pago)</option>
          {PLAZOS_MSI.map((plazos) => (
            <option key={plazos} value={plazos}>
              {plazos} meses sin intereses
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria-cargo">Categoría</Label>
        <SelectorCategoria id="categoria-cargo" value={categoriaId} onChange={setCategoriaId} />
      </div>

      {registrarCargo.isError && <p className="text-sm text-destructive">{registrarCargo.error.message}</p>}
      <Button type="submit" disabled={registrarCargo.isPending}>
        {registrarCargo.isPending ? 'Guardando…' : 'Registrar cargo'}
      </Button>
    </form>
  );
}
