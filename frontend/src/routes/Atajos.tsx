import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { FilaAtajo } from '@/components/FilaAtajo';
import { FormularioAtajo } from '@/components/FormularioAtajo';
import { HojaInferior } from '@/components/HojaInferior';
import { PageHeader } from '@/components/PageHeader';
import { useAtajos } from '@/hooks/use-atajos';

/**
 * Ajustes → Atajos de gasto. Cada atajo aparece en Inicio como un botón que registra el gasto de hoy con un toque.
 * Mismo patrón que Recurrentes.tsx: no depende de tener un periodo activo. Al llegar al límite del plan (Free 3,
 * Pro 12) el botón "Nuevo atajo" se apaga y se dice por qué; el servidor lo valida igual.
 */
export function Atajos() {
  const { data, isLoading, error } = useAtajos();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const llegoAlLimite = data !== undefined && data.atajos.length >= data.limite;

  const botonNuevo = (
    <Button onClick={() => setMostrarFormulario(true)} disabled={!data || llegoAlLimite} className="hidden rounded-xl sm:inline-flex">
      <Plus size={16} strokeWidth={2.5} />
      Nuevo atajo
    </Button>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col sm:max-w-2xl sm:px-8 sm:pt-8 lg:max-w-4xl xl:max-w-6xl">
      <PageHeader titulo="Atajos de gasto" accion={botonNuevo} />
      <p className="text-muted-foreground px-5 pb-3 text-[13px] sm:px-0">
        Gastos que repites, a un toque desde Inicio: el café, el camión, la comida del día.
        {data && ` Llevas ${data.atajos.length} de ${data.limite}.`}
      </p>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-4 sm:px-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {data?.atajos.length === 0 && <p className="text-muted-foreground">Todavía no tienes ningún atajo. Crea el primero con “Nuevo atajo”.</p>}
        {data && data.atajos.length > 0 && (
          <ul className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 xl:grid-cols-3">
            {data.atajos.map((atajo) => (
              <FilaAtajo key={atajo.id} atajo={atajo} />
            ))}
          </ul>
        )}
        {llegoAlLimite && <p className="text-muted-foreground text-[13px]">Llegaste al límite de atajos de tu plan. Elimina uno para crear otro.</p>}
      </div>

      <div className="px-5 pb-6 sm:hidden">
        <button
          onClick={() => setMostrarFormulario(true)}
          disabled={!data || llegoAlLimite}
          className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold disabled:opacity-50"
        >
          <Plus size={17} strokeWidth={2.5} />
          Nuevo atajo
        </button>
      </div>

      <BottomNav />

      {mostrarFormulario && (
        <HojaInferior titulo="Nuevo atajo" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioAtajo onGuardado={() => setMostrarFormulario(false)} onCancelar={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </div>
  );
}
