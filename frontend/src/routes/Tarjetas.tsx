import { Plus } from 'lucide-react';
import { useState } from 'react';

import { BottomNav } from '@/components/BottomNav';
import { FilaTarjeta } from '@/components/FilaTarjeta';
import { FormularioTarjeta } from '@/components/FormularioTarjeta';
import { HojaInferior } from '@/components/HojaInferior';
import { PageHeader } from '@/components/PageHeader';
import { useTarjetas } from '@/hooks/use-tarjetas';

/** Mismo patrón que Metas.tsx/Recurrentes.tsx: sin periodo activo no se bloquea la pantalla — dar de alta una tarjeta y ver su deuda no depende de tener uno. */
export function Tarjetas() {
  const { data: tarjetas, isLoading, error } = useTarjetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col">
      <PageHeader titulo="Tarjetas de crédito" />

      <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-4">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {tarjetas?.length === 0 && <p className="text-muted-foreground">Todavía no tienes ninguna tarjeta registrada.</p>}
        {tarjetas && tarjetas.length > 0 && (
          <ul className="flex flex-col gap-5">
            {tarjetas.map((tarjeta) => (
              <FilaTarjeta key={tarjeta.id} tarjeta={tarjeta} />
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 pb-6">
        <button
          onClick={() => setMostrarFormulario(true)}
          className="bg-primary text-primary-foreground flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold"
        >
          <Plus size={17} strokeWidth={2.5} />
          Nueva tarjeta
        </button>
      </div>

      <BottomNav />

      {mostrarFormulario && (
        <HojaInferior titulo="Nueva tarjeta" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioTarjeta onCreada={() => setMostrarFormulario(false)} onCancelar={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </div>
  );
}
