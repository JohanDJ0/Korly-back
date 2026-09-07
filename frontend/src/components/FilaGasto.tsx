import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditarGasto } from '@/hooks/use-editar-gasto';
import { useEliminarGasto } from '@/hooks/use-eliminar-gasto';
import type { Gasto } from '@/hooks/use-gastos';
import { formatearMonto } from '@/lib/dinero';

interface FilaGastoProps {
  gasto: Gasto;
}

/**
 * Editar/eliminar aquí siempre corrige el MISMO periodo que se está
 * viendo (es el periodo activo — ver Historial.tsx) — el backend nunca
 * muta esta fila, genera una reversión y, al editar, una fila nueva
 * (ver backend/README.md, "Editar y eliminar un gasto"). Por eso, tras
 * guardar, esta fila puede seguir mostrando el monto viejo hasta que el
 * refetch trae la fila nueva — es el comportamiento correcto, no un bug.
 */
export function FilaGasto({ gasto }: FilaGastoProps) {
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(() => (gasto.monto.valorMinimo / 100).toString());
  const editarGasto = useEditarGasto();
  const eliminarGasto = useEliminarGasto();

  function guardar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) return;
    editarGasto.mutate(
      { gastoId: gasto.id, monto: { valorMinimo: Math.round(valor * 100), moneda: gasto.monto.moneda } },
      { onSuccess: () => setEditando(false) }
    );
  }

  function eliminar() {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    editarGasto.reset();
    eliminarGasto.mutate(gasto.id);
  }

  // Ya se editó o eliminó antes (backend/README.md, "Listar gastos") —
  // la fila queda para siempre por el "nunca hard delete", pero editarla
  // o eliminarla de nuevo solo daría GASTO_YA_REVERTIDO. Se muestra
  // atenuada y sin acciones en vez de invitar a un click que va a
  // fallar seguro.
  if (gasto.revertido) {
    return (
      <li className="flex items-center justify-between gap-2 border-b py-3 opacity-50">
        <div>
          <p className="font-medium line-through">{formatearMonto(gasto.monto)}</p>
          <p className="text-sm text-muted-foreground">
            {gasto.fechaEfectiva}
            {gasto.nota ? ` — ${gasto.nota}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">Corregido</span>
      </li>
    );
  }

  if (editando) {
    return (
      <li className="flex flex-wrap items-center gap-2 border-b py-3">
        <Input
          value={monto}
          onChange={(evento) => setMonto(evento.target.value)}
          type="number"
          step="0.01"
          min="0"
          autoFocus
          className="w-28"
        />
        <Button size="sm" onClick={guardar} disabled={editarGasto.isPending}>
          {editarGasto.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            editarGasto.reset();
            setEditando(false);
          }}
        >
          Cancelar
        </Button>
        {editarGasto.isError && <p className="w-full text-sm text-destructive">{editarGasto.error.message}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 border-b py-3">
      <div>
        <p className="font-medium">{formatearMonto(gasto.monto)}</p>
        <p className="text-sm text-muted-foreground">
          {gasto.fechaEfectiva}
          {gasto.nota ? ` — ${gasto.nota}` : ''}
        </p>
        {eliminarGasto.isError && <p className="text-sm text-destructive">{eliminarGasto.error.message}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Sin esto, un error de "Eliminar" fallido se quedaba visible
            // en esta fila aunque la edición que siguiera funcionara bien
            // — el estado de error de una mutation no se limpia solo
            // hasta que esa MISMA mutation se vuelve a llamar.
            eliminarGasto.reset();
            setEditando(true);
          }}
        >
          Editar
        </Button>
        <Button size="sm" variant="outline" onClick={eliminar} disabled={eliminarGasto.isPending}>
          Eliminar
        </Button>
      </div>
    </li>
  );
}
