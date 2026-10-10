import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { useActualizarAtajo } from '@/hooks/use-actualizar-atajo';
import type { Atajo } from '@/hooks/use-atajos';
import { useCrearAtajo } from '@/hooks/use-crear-atajo';

const esquemaAtajo = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre (p. ej. 'Café')").max(30, 'Máximo 30 caracteres'),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
});

type AtajoFormEntrada = z.input<typeof esquemaAtajo>;
type AtajoFormSalida = z.output<typeof esquemaAtajo>;

interface FormularioAtajoProps {
  /** Con un atajo se edita; sin él, se crea uno nuevo. */
  atajo?: Atajo;
  onGuardado?: () => void;
  onCancelar?: () => void;
}

/** Crear o editar un atajo de gasto (Ajustes → Atajos de gasto). El monto se escribe en pesos, como en el formulario de gasto. */
export function FormularioAtajo({ atajo, onGuardado, onCancelar }: FormularioAtajoProps) {
  const crearAtajo = useCrearAtajo();
  const actualizarAtajo = useActualizarAtajo();
  const [categoriaId, setCategoriaId] = useState(atajo?.categoriaId ?? '');
  const mutacion = atajo ? actualizarAtajo : crearAtajo;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AtajoFormEntrada, unknown, AtajoFormSalida>({
    resolver: zodResolver(esquemaAtajo),
    defaultValues: atajo ? { nombre: atajo.nombre, monto: atajo.monto.valorMinimo / 100 } : undefined,
  });

  function onSubmit(datos: AtajoFormSalida) {
    const monto = { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' };
    const alTerminar = { onSuccess: () => onGuardado?.() };
    if (atajo) {
      actualizarAtajo.mutate({ atajoId: atajo.id, nombre: datos.nombre, monto, categoriaId: categoriaId || null }, alTerminar);
    } else {
      crearAtajo.mutate({ nombre: datos.nombre, monto, categoriaId: categoriaId || undefined }, alTerminar);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre-atajo-form">Nombre</Label>
        <Input id="nombre-atajo-form" placeholder="Café, camión, comida…" maxLength={30} autoFocus {...register('nombre')} />
        {errors.nombre && <p className="text-destructive text-sm">{errors.nombre.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="monto-atajo-form">Monto</Label>
        <Input id="monto-atajo-form" type="number" step="0.01" min="0" inputMode="decimal" {...register('monto')} />
        {errors.monto && <p className="text-destructive text-sm">{errors.monto.message}</p>}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label className="text-muted-foreground text-[12.5px] font-semibold tracking-wide">CATEGORÍA (OPCIONAL)</Label>
        <SelectorCategoriaChips value={categoriaId} onChange={setCategoriaId} />
      </div>

      {mutacion.isError && <p className="text-destructive text-sm">{mutacion.error.message}</p>}
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
