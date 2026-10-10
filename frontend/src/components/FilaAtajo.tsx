import { Pencil, Zap } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { FormularioAtajo } from '@/components/FormularioAtajo';
import { HojaInferior } from '@/components/HojaInferior';
import { useCategorias } from '@/hooks/use-categorias';
import type { Atajo } from '@/hooks/use-atajos';
import { useEliminarAtajo } from '@/hooks/use-eliminar-atajo';
import { useFormatearMonto } from '@/hooks/use-formatear-monto';

interface FilaAtajoProps {
  atajo: Atajo;
}

export function FilaAtajo({ atajo }: FilaAtajoProps) {
  const formatearMonto = useFormatearMonto();
  const { data: categorias } = useCategorias();
  const eliminarAtajo = useEliminarAtajo();
  const [editando, setEditando] = useState(false);
  const categoria = categorias?.find((c) => c.id === atajo.categoriaId);

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-2xl border p-3.5">
      <div className="flex items-center gap-3">
        <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-[11px]">
          <Zap size={17} className="text-secondary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{atajo.nombre}</p>
          <p className="text-muted-foreground mt-px text-[12.5px]">
            {formatearMonto(atajo.monto)}
            {categoria ? ` — ${categoria.nombre}` : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={() => setEditando(true)} aria-label={`Editar ${atajo.nombre}`}>
          <Pencil size={14} />
          Editar
        </Button>
      </div>
      <BotonConfirmar
        pregunta={`¿Eliminar el atajo "${atajo.nombre}"?`}
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 self-start"
        disabled={eliminarAtajo.isPending}
        onConfirmar={() => eliminarAtajo.mutate(atajo.id)}
      >
        Eliminar
      </BotonConfirmar>
      {eliminarAtajo.isError && <p className="text-destructive text-sm">{eliminarAtajo.error.message}</p>}

      {editando && (
        <HojaInferior titulo="Editar atajo" onCerrar={() => setEditando(false)}>
          <FormularioAtajo atajo={atajo} onGuardado={() => setEditando(false)} onCancelar={() => setEditando(false)} />
        </HojaInferior>
      )}
    </li>
  );
}
