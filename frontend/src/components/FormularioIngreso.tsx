import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegistrarIngreso } from '@/hooks/use-registrar-ingreso';
import { usePeriodoActivo } from '@/hooks/use-periodo-activo';
import { formatearRangoFechas, hoyISO } from '@/lib/fechas';
import { NOTA_INGRESO_FIN_DE_QUINCENA, quincenaPorTerminar } from '@/lib/fin-de-quincena';

const esquemaIngreso = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
  fechaEfectiva: z.string().min(1, 'Selecciona una fecha'),
});

// z.coerce hace que el tipo de entrada (lo que llega del <input>, un
// string) difiera del de salida (number, ya validado) — react-hook-form
// necesita ambos por separado, no solo el de salida.
type IngresoFormEntrada = z.input<typeof esquemaIngreso>;
type IngresoFormSalida = z.output<typeof esquemaIngreso>;

interface FormularioIngresoProps {
  periodoId: string;
  /** Para cerrar la hoja inferior cuando el ingreso es uno adicional (bono, dinero extra) y no el primero. */
  onRegistrado?: () => void;
  /**
   * Es el primer ingreso de la quincena (la tarjeta "Registra tu ingreso"): se pregunta por el dinero que se tiene, no por el
   * pago — quien empieza a mitad de quincena anota lo que le queda hoy, y "¿Cuánto recibiste?" le hacía pensar que tenía que
   * esperar al siguiente pago. Los ingresos adicionales siguen preguntando por lo que se recibió.
   */
  primerIngreso?: boolean;
}

/**
 * Monto es el único campo que el usuario normalmente toca — la fecha
 * llega precargada con hoy (CLAUDE.md, "captura en ≤2 toques"). La
 * conversión pesos → centavos ocurre aquí, en el submit: es el único
 * lugar del frontend donde el usuario escribe dinero en formato humano
 * antes de que se convierta a la unidad mínima que espera el backend.
 */
export function FormularioIngreso({ periodoId, onRegistrado, primerIngreso = false }: FormularioIngresoProps) {
  const registrarIngreso = useRegistrarIngreso();
  const { data: periodo } = usePeriodoActivo();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IngresoFormEntrada, unknown, IngresoFormSalida>({
    resolver: zodResolver(esquemaIngreso),
    defaultValues: { fechaEfectiva: hoyISO() },
  });

  function onSubmit(datos: IngresoFormSalida) {
    registrarIngreso.mutate(
      {
        periodoId,
        monto: { valorMinimo: Math.round(datos.monto * 100), moneda: 'MXN' },
        fechaEfectiva: datos.fechaEfectiva,
      },
      { onSuccess: () => onRegistrado?.() }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="monto">{primerIngreso ? '¿Cuánto dinero tienes para esta quincena?' : '¿Cuánto recibiste?'}</Label>
        <Input id="monto" type="number" step="0.01" min="0" inputMode="decimal" autoFocus {...register('monto')} />
        {errors.monto && <p className="text-sm text-destructive">{errors.monto.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fechaEfectiva">¿Cuándo te pagaron?</Label>
        <Input id="fechaEfectiva" type="date" {...register('fechaEfectiva')} />
        {periodo && (
          <p className="text-muted-foreground text-[12.5px]">
            Es solo la fecha en que te llegó el dinero. Tu quincena es del {formatearRangoFechas(periodo.fechaInicio, periodo.fechaFin)} y no cambia por esta fecha.
          </p>
        )}
        {errors.fechaEfectiva && <p className="text-sm text-destructive">{errors.fechaEfectiva.message}</p>}
      </div>
      {periodo && quincenaPorTerminar(periodo.fechaFin, hoyISO()) && (
        // En los últimos días: un pago adelantado de la quincena siguiente registrado hoy inflaría la cifra de estos días.
        <p className="bg-secondary text-secondary-foreground rounded-xl px-3 py-2 text-[12.5px]">{NOTA_INGRESO_FIN_DE_QUINCENA}</p>
      )}
      {registrarIngreso.isError && <p className="text-sm text-destructive">{registrarIngreso.error.message}</p>}
      <Button type="submit" disabled={registrarIngreso.isPending}>
        {registrarIngreso.isPending ? 'Guardando…' : 'Registrar ingreso'}
      </Button>
    </form>
  );
}
