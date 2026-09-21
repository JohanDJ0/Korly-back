import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { FilaMeta } from '@/components/FilaMeta';
import { FormularioMeta } from '@/components/FormularioMeta';
import { HojaInferior } from '@/components/HojaInferior';
import { PageHeader } from '@/components/PageHeader';
import { useMetas } from '@/hooks/use-metas';

/** Sin periodo activo no se bloquea la pantalla — se puede crear y ver metas siempre; solo aportar/retirar exigen uno (ver FilaMeta.tsx). */
export function Metas() {
  const { data: metas, isLoading, error } = useMetas();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col md:max-w-4xl md:px-8 md:pt-8">
      <PageHeader
        titulo="Metas de ahorro"
        accion={
          <Button onClick={() => setMostrarFormulario(true)} className="hidden rounded-xl md:inline-flex">
            <Plus size={16} strokeWidth={2.5} />
            Nueva meta
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-4 md:px-0 md:pt-0">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {metas?.length === 0 && <p className="text-muted-foreground">Todavía no tienes ninguna meta.</p>}
        {metas && metas.length > 0 && (
          <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4 lg:grid-cols-3">
            {metas.map((meta) => (
              <FilaMeta key={meta.id} meta={meta} />
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
          Nueva meta
        </button>
      </div>

      <BottomNav />

      {mostrarFormulario && (
        <HojaInferior titulo="Nueva meta" onCerrar={() => setMostrarFormulario(false)}>
          <FormularioMeta onCreada={() => setMostrarFormulario(false)} onCancelar={() => setMostrarFormulario(false)} />
        </HojaInferior>
      )}
    </div>
  );
}
