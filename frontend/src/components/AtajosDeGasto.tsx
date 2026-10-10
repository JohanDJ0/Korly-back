import { Check, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAtajos, type Atajo } from '@/hooks/use-atajos';
import { useDisponible } from '@/hooks/use-disponible';
import { useEliminarGasto } from '@/hooks/use-eliminar-gasto';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';
import { useRegistrarGasto } from '@/hooks/use-registrar-gasto';
import { hoyISO } from '@/lib/fechas';

/** Cuánto se ofrece "Deshacer" tras registrar con un atajo. */
const MS_PARA_DESHACER = 7000;

interface AtajosDeGastoProps {
  periodoId: string;
  /** Un atajo que supera lo disponible no se registra solo: Home abre el formulario normal con sus datos puestos. */
  onAbrirFormulario: (atajo: Atajo) => void;
}

/**
 * Los atajos de gasto en Inicio: un toque registra el gasto de hoy con el monto, la categoría y el nombre (como nota)
 * del atajo — el mismo `POST` de siempre, no un camino aparte. Sin atajos no se pinta nada (Inicio no se llena de
 * cosas; se crean desde Ajustes o con "Guardar como atajo" en el formulario de gasto).
 *
 * **Si el atajo es mayor a lo disponible no se registra directo:** se abre el formulario con todo prellenado, y ahí
 * sale el aviso de siempre (un toque más, pero un gasto grande por accidente es justo lo que ese aviso evita).
 * **Deshacer** borra el gasto recién registrado por la vía normal (queda como corrección en el ledger).
 */
export function AtajosDeGasto({ periodoId, onAbrirFormulario }: AtajosDeGastoProps) {
  const formatearMonto = useFormatearMonto();
  const { data: lista } = useAtajos();
  const { data: disponible } = useDisponible();
  const registrarGasto = useRegistrarGasto();
  const eliminarGasto = useEliminarGasto();
  // Todos los gastos registrados con atajos desde que se apagó el aviso (el más reciente al final): un toque repetido
  // registra otro gasto, y cada "Deshacer" quita uno, del último al primero.
  const [registrados, setRegistrados] = useState<{ gastoId: string; nombre: string; monto: Atajo['monto'] }[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  /** Cada gasto nuevo da otros 7 segundos para deshacer; al vencerse, el aviso (y los "Deshacer" pendientes) se van. */
  function reiniciarTemporizador() {
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setRegistrados([]), MS_PARA_DESHACER);
  }

  function tocar(atajo: Atajo) {
    eliminarGasto.reset();
    if (disponible?.estado === 'ok' && atajo.monto.valorMinimo > disponible.disponible.valorMinimo) {
      onAbrirFormulario(atajo);
      return;
    }
    registrarGasto.mutate(
      { periodoId, monto: atajo.monto, fechaEfectiva: hoyISO(), categoriaId: atajo.categoriaId ?? undefined, nota: atajo.nombre },
      {
        onSuccess: (gasto) => {
          setRegistrados((previos) => [...previos, { gastoId: gasto.id, nombre: atajo.nombre, monto: atajo.monto }]);
          reiniciarTemporizador();
        },
      }
    );
  }

  const ultimo = registrados[registrados.length - 1];

  function deshacer() {
    if (!ultimo) return;
    eliminarGasto.mutate(ultimo.gastoId, {
      onSuccess: () => {
        setRegistrados((previos) => previos.filter((r) => r.gastoId !== ultimo.gastoId));
        reiniciarTemporizador();
      },
    });
  }

  const atajos = lista?.atajos ?? [];
  if (atajos.length === 0 && registrados.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {atajos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-muted-foreground flex items-center gap-1 text-[11.5px] font-semibold tracking-wide">
            <Zap size={12} strokeWidth={2.5} />
            ATAJOS · un toque registra el gasto
          </h2>
          <div className="flex flex-wrap gap-2">
            {atajos.map((atajo) => (
              <button
                key={atajo.id}
                type="button"
                onClick={() => tocar(atajo)}
                disabled={registrarGasto.isPending}
                className="border-border bg-card text-foreground flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium disabled:opacity-60"
              >
                {atajo.nombre}{' '}
                <span className="text-muted-foreground">{formatearMonto(atajo.monto)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ultimo && (
        <div role="status" className="bg-secondary text-secondary-foreground flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]">
          <Check size={15} strokeWidth={2.5} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {registrados.length === 1
              ? `Registrado: ${ultimo.nombre} ${formatearMonto(ultimo.monto)}`
              : `Registraste ${registrados.length} gastos. El último: ${ultimo.nombre} ${formatearMonto(ultimo.monto)}`}
          </span>
          <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 rounded-lg px-2" disabled={eliminarGasto.isPending} onClick={deshacer}>
            {eliminarGasto.isPending ? 'Deshaciendo…' : registrados.length > 1 ? 'Deshacer el último' : 'Deshacer'}
          </Button>
        </div>
      )}
      {registrarGasto.isError && <p className="text-destructive text-sm">{registrarGasto.error.message}</p>}
      {eliminarGasto.isError && <p className="text-destructive text-sm">{eliminarGasto.error.message}</p>}
    </div>
  );
}
