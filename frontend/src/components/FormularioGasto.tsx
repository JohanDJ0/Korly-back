import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorCategoriaChips } from '@/components/SelectorCategoriaChips';
import { useDisponible } from '@/hooks/use-disponible';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';
import { formatearMonto } from '@/lib/dinero';
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
 *
 * **Confirmación solo cuando el gasto supera lo disponible.** El backend registra el gasto
 * aunque sobregire la quincena (ya ocurrió en la vida real, modelo-dominio.md §5), pero una
 * cifra de "te quedan $-300" por un dedazo de un cero es una mala sorpresa: en ese caso, y solo
 * en ese caso, se pide un segundo toque explícito. El flujo normal sigue siendo un solo toque.
 */
export function FormularioGasto({ periodoId, onRegistrado }: FormularioGastoProps) {
  const registrarGasto = useRegistrarGasto();
  const { data: disponible } = useDisponible();
  const [categoriaId, setCategoriaId] = useState('');
  // El gasto que superó lo disponible y espera que el usuario lo confirme o lo corrija.
  const [aConfirmar, setAConfirmar] = useState<GastoFormSalida | null>(null);

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

  /** Cuánto le faltaría a la quincena (en centavos, positivo) si se registra este monto; 0 si alcanza o si no se sabe el disponible. */
  function faltante(monto: number): number {
    if (disponible?.estado !== 'ok') return 0;
    return Math.max(0, Math.round(monto * 100) - disponible.disponible.valorMinimo);
  }

  // El aviso solo vale mientras el monto escrito sea el mismo que lo disparó: si lo corrige, desaparece solo.
  const mostrandoAviso = aConfirmar !== null && montoValido === aConfirmar.monto && faltante(aConfirmar.monto) > 0;

  function onSubmit(datos: GastoFormSalida) {
    if (faltante(datos.monto) > 0) {
      setAConfirmar(datos);
      return;
    }
    enviar(datos);
  }

  function enviar(datos: GastoFormSalida) {
    setAConfirmar(null);
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

      {mostrandoAviso && aConfirmar && disponible?.estado === 'ok' ? (
        <div role="alert" className="border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-2xl border p-4">
          <div>
            <p className="text-[14.5px] font-semibold">Este gasto es mayor a lo que tienes disponible</p>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Tienes {formatearMonto(disponible.disponible)} y este gasto es de {formatearMonto({ valorMinimo: Math.round(aConfirmar.monto * 100), moneda: disponible.disponible.moneda })}: tu quincena quedaría en{' '}
              <span className="text-destructive font-semibold">-{formatearMonto({ valorMinimo: faltante(aConfirmar.monto), moneda: disponible.disponible.moneda })}</span>.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="destructive" disabled={registrarGasto.isPending} onClick={() => enviar(aConfirmar)} className="h-auto flex-1 rounded-xl py-3 text-[14.5px] font-semibold">
              {registrarGasto.isPending ? 'Guardando…' : 'Registrar de todos modos'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAConfirmar(null)} className="h-auto flex-1 rounded-xl py-3 text-[14.5px] font-semibold">
              Corregir el monto
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" disabled={registrarGasto.isPending} className="h-auto rounded-2xl py-3.5 text-[15.5px] font-semibold">
          {registrarGasto.isPending
            ? 'Guardando…'
            : `Registrar${Number.isFinite(montoValido) && montoValido > 0 ? ` ${montoValido.toFixed(2)}` : ''}`}
        </Button>
      )}

      {/*
        Hallazgo real: un usuario registró una compra con tarjeta de
        crédito como gasto normal en vez de "Registrar cargo" en
        Tarjetas — un gasto normal sale directo del disponible de la
        quincena, sin ninguna relación con una tarjeta, así que el saldo
        de la tarjeta y el gasto quedaron como dos cosas sueltas que no
        cuadraban. Este es el único lugar donde alguien en ese punto
        podría darse cuenta a tiempo — un link discreto, no un aviso que
        bloquee o agregue un toque a la captura de todos los días.
      */}
      <Link to="/tarjetas" className="text-muted-foreground text-center text-[12.5px] underline-offset-2 hover:underline">
        ¿Lo pagaste con tarjeta de crédito? Regístralo en Tarjetas
      </Link>
    </form>
  );
}
