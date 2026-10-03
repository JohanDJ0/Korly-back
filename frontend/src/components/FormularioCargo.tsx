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
const OTRO_PLAZO = 'otro';

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
 * libre en el caso común, es una elección entre "de contado" y los
 * plazos de MSI que de verdad ofrecen los bancos) — mismo criterio que
 * `categoriaId` en FormularioGasto.tsx. "Otro" revela un número libre
 * para el caso de una compra que ya traías de antes de usar Korly con
 * un número de pagos restantes que no es ninguno de los MSI estándar
 * (p. ej. una compra a 12 meses de la que ya pagaste 5 — ahí van 7, no
 * 12; ver el aviso de "saldo restante" más abajo).
 */
export function FormularioCargo({ tarjetaId, onRegistrado }: FormularioCargoProps) {
  const registrarCargo = useRegistrarCargo();
  const [seleccionPlazo, setSeleccionPlazo] = useState<number | typeof OTRO_PLAZO>(1);
  const [plazoLibre, setPlazoLibre] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  const numeroPlazos = seleccionPlazo === OTRO_PLAZO ? Number(plazoLibre) : seleccionPlazo;
  const numeroPlazosValido = Number.isInteger(numeroPlazos) && numeroPlazos >= 1;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CargoFormEntrada, unknown, CargoFormSalida>({ resolver: zodResolver(esquemaCargo) });

  function onSubmit(datos: CargoFormSalida) {
    if (!numeroPlazosValido) return;
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
          setSeleccionPlazo(1);
          setPlazoLibre('');
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
          value={seleccionPlazo}
          onChange={(evento) => setSeleccionPlazo(evento.target.value === OTRO_PLAZO ? OTRO_PLAZO : Number(evento.target.value))}
          className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
        >
          <option value={1}>De contado (1 pago)</option>
          {PLAZOS_MSI.map((plazos) => (
            <option key={plazos} value={plazos}>
              {plazos} meses sin intereses
            </option>
          ))}
          <option value={OTRO_PLAZO}>Otro número de plazos…</option>
        </select>
        {seleccionPlazo === OTRO_PLAZO && (
          <Input
            type="number"
            step="1"
            min="1"
            inputMode="numeric"
            placeholder="Número de plazos"
            value={plazoLibre}
            onChange={(evento) => setPlazoLibre(evento.target.value)}
            aria-label="Número de plazos"
          />
        )}
        {/*
          No es un campo nuevo ni una validación nueva — es la misma
          "Monto total"/"Plazo" de siempre, usadas para representar lo
          que falta en vez de lo original. Sin esto, no había ninguna
          forma de registrar bien una compra que ya traías a medias al
          empezar a usar Korly (hallazgo real: se intentó anotar una
          compra a 12 MSI ya con varios pagos hechos, y no había dónde
          decir "van 5 pagados, faltan 7").
        */}
        <p className="text-muted-foreground text-xs">
          ¿Esta compra ya tenía pagos hechos antes de usar Korly? Pon aquí el <strong>saldo que aún debes</strong>, y en plazo los{' '}
          <strong>pagos que te faltan</strong> — no el monto ni el plazo originales.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria-cargo">Categoría</Label>
        <SelectorCategoria id="categoria-cargo" value={categoriaId} onChange={setCategoriaId} />
      </div>

      {seleccionPlazo === OTRO_PLAZO && plazoLibre.length > 0 && !numeroPlazosValido && (
        <p className="text-sm text-destructive">El número de plazos debe ser un entero de 1 o más</p>
      )}
      {registrarCargo.isError && <p className="text-sm text-destructive">{registrarCargo.error.message}</p>}
      <Button type="submit" disabled={registrarCargo.isPending || !numeroPlazosValido}>
        {registrarCargo.isPending ? 'Guardando…' : 'Registrar cargo'}
      </Button>
    </form>
  );
}
