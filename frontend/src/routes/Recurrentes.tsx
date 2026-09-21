import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { FilaRecurrente } from '@/components/FilaRecurrente';
import { FormularioRecurrente } from '@/components/FormularioRecurrente';
import { HojaInferior } from '@/components/HojaInferior';
import { PageHeader } from '@/components/PageHeader';
import { useRecurrentes } from '@/hooks/use-recurrentes';

/** Mismo patrón que Metas.tsx: sin periodo activo no se bloquea la pantalla, ver/crear/pausar recurrentes no depende de tener uno. */
export function Recurrentes() {
  const { data: recurrentes, isLoading, error } = useRecurrentes();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col md:max-w-4xl md:px-8 md:pt-8">
      <PageHeader
        titulo="Gastos recurrentes"
        accion={
          <Button onClick={() => setMostrarFormulario(true)} className="hidden rounded-xl md:inline-flex">
            <Plus size={16} strokeWidth={2.5} />
            Nuevo gasto recurrente
          </Button>
        }
      />
      <p className="text-muted-foreground px-5 pb-3 text-[13px] md:px-0">Se aplican solos cuando toca — no hace falta capturarlos a mano.</p>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-4 md:px-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {recurrentes?.length === 0 && <p className="text-muted-foreground">Todavía no tienes ninguna suscripción o gasto recurrente registrado.</p>}
        {recurrentes && recurrentes.length > 0 && (
          <ul className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 xl:grid-cols-3">
            {recurrentes.map((recurrente) => (
              <FilaRecurrente key={recurrente.id} recurrente={recurrente} />
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 pb-6 md:hidden">
        <button
          onClick={() => setMostrarFormulario(true)}
          className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold"
        >
          <Plus size={17} strokeWidth={2.5} />
          Nuevo gasto recurrente
        </button>
      </div>

      <BottomNav />

      {mostrarFormulario && (
        <HojaInferior titulo="Nuevo gasto recurrente" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioRecurrente onCreado={() => setMostrarFormulario(false)} onCancelar={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </div>
  );
}
