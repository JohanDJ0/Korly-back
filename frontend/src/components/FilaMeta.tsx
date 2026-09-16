import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAportarMeta } from '@/hooks/use-aportar-meta';
import { useEliminarMeta } from '@/hooks/use-eliminar-meta';
import type { Meta } from '@/hooks/use-metas';
import { useRetirarMeta } from '@/hooks/use-retirar-meta';
import { formatearMonto } from '@/lib/dinero';

interface FilaMetaProps {
  meta: Meta;
}

type Modo = 'aportar' | 'retirar' | null;

/**
 * Aportar reduce el disponible del periodo activo (como un gasto);
 * retirar lo aumenta (como un ingreso) — ver backend/README.md, "Metas
 * de ahorro". Ambos requieren periodo activo: si no hay uno, el error
 * del backend (`SIN_PERIODO_ACTIVO`) se muestra tal cual, no se
 * duplica la validación aquí.
 */
export function FilaMeta({ meta }: FilaMetaProps) {
  const [modo, setModo] = useState<Modo>(null);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  // Hallazgo del pase de QA/UX: un monto/motivo inválido no debe fallar
  // en silencio (el botón simplemente sin hacer nada, sin explicar por
  // qué) — a diferencia de FormularioGasto/FormularioMeta (RHF + Zod,
  // con su propio manejo de errores), este formulario inline usa
  // useState simple, así que el mensaje se arma a mano aquí.
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const aportarMeta = useAportarMeta();
  const retirarMeta = useRetirarMeta();
  const eliminarMeta = useEliminarMeta();

  function eliminar() {
    if (!window.confirm(`¿Eliminar la meta "${meta.nombre}"?`)) return;
    eliminarMeta.mutate(meta.id);
  }

  function cerrar() {
    setModo(null);
    setMonto('');
    setMotivo('');
    setErrorValidacion(null);
    aportarMeta.reset();
    retirarMeta.reset();
  }

  function confirmar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorValidacion('El monto debe ser mayor a cero');
      return;
    }
    if (modo === 'retirar' && motivo.trim().length === 0) {
      setErrorValidacion('Indica un motivo para el retiro');
      return;
    }
    setErrorValidacion(null);
    const montoDto = { valorMinimo: Math.round(valor * 100), moneda: meta.montoObjetivo.moneda };

    if (modo === 'aportar') {
      aportarMeta.mutate({ metaId: meta.id, monto: montoDto }, { onSuccess: cerrar });
    } else if (modo === 'retirar') {
      retirarMeta.mutate({ metaId: meta.id, monto: montoDto, motivo }, { onSuccess: cerrar });
    }
  }

  const pendiente = aportarMeta.isPending || retirarMeta.isPending;
  const mensajeError = errorValidacion ?? (aportarMeta.error ?? retirarMeta.error ?? eliminarMeta.error)?.message;

  return (
    <li className="flex flex-col gap-2 border-b py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{meta.nombre}</p>
          <p className="text-sm text-muted-foreground">
            {formatearMonto(meta.montoAcumulado)} de {formatearMonto(meta.montoObjetivo)} ({meta.porcentajeAvance.toFixed(0)}%)
          </p>
        </div>
        {modo === null && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setModo('aportar')}>
              Aportar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModo('retirar')}>
              Retirar
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={eliminar} disabled={eliminarMeta.isPending}>
              Eliminar
            </Button>
          </div>
        )}
      </div>

      {modo !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={monto}
            onChange={(evento) => {
              setMonto(evento.target.value);
              setErrorValidacion(null);
            }}
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto"
            autoFocus
            className="w-28"
          />
          {modo === 'retirar' && (
            <Input
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value);
                setErrorValidacion(null);
              }}
              placeholder="Motivo"
              className="w-40"
            />
          )}
          <Button size="sm" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Guardando…' : modo === 'aportar' ? 'Aportar' : 'Retirar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
        </div>
      )}
      {mensajeError && <p className="text-sm text-destructive">{mensajeError}</p>}
    </li>
  );
}
