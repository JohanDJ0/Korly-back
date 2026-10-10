import { Zap } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrearAtajo } from '@/hooks/use-crear-atajo';

interface GuardarComoAtajoProps {
  /** Pesos, tal como están escritos en el formulario (ya validado > 0 por quien lo pinta). */
  monto: number;
  categoriaId: string;
  /** Lo que se propone como nombre: la nota que se escribió, o el nombre de la categoría. */
  nombreSugerido: string;
  /** Se llama al guardarse el atajo (la guía lo usa para dar su pista por leída). */
  onGuardado?: () => void;
}

/**
 * "Guardar como atajo" dentro del formulario de gasto: toma el monto y la categoría que ya están puestos y solo
 * pide el nombre. No registra el gasto ni cierra nada — es un paso aparte, opcional, que no agrega toques al flujo
 * normal. Los errores del servidor (límite del plan, nombre repetido) se muestran tal cual: ya vienen redactados.
 */
export function GuardarComoAtajo({ monto, categoriaId, nombreSugerido, onGuardado }: GuardarComoAtajoProps) {
  const crearAtajo = useCrearAtajo();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardado, setGuardado] = useState<string | null>(null);

  function abrir() {
    crearAtajo.reset();
    setGuardado(null);
    setNombre(nombreSugerido.trim().slice(0, 30));
    setAbierto(true);
  }

  function guardar() {
    const limpio = nombre.trim();
    if (limpio.length === 0) return;
    crearAtajo.mutate(
      { nombre: limpio, monto: { valorMinimo: Math.round(monto * 100), moneda: 'MXN' }, categoriaId: categoriaId || undefined },
      {
        onSuccess: (atajo) => {
          setGuardado(atajo.nombre);
          setAbierto(false);
          onGuardado?.();
        },
      }
    );
  }

  if (abierto) {
    return (
      <div className="border-border flex flex-col gap-2.5 rounded-2xl border p-3.5">
        <label htmlFor="nombre-atajo" className="text-[13px] font-medium">
          Nombre del atajo
        </label>
        <Input
          id="nombre-atajo"
          value={nombre}
          maxLength={30}
          placeholder="p. ej. Café"
          autoFocus
          onChange={(evento) => setNombre(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault(); // Enter aquí guarda el atajo, no registra el gasto
              guardar();
            }
          }}
        />
        {crearAtajo.isError && <p className="text-destructive text-sm">{crearAtajo.error.message}</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={guardar} disabled={crearAtajo.isPending || nombre.trim().length === 0}>
            {crearAtajo.isPending ? 'Guardando…' : 'Guardar atajo'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (guardado) {
    return (
      <p role="status" className="text-muted-foreground text-center text-[12.5px]">
        Atajo “{guardado}” guardado: lo verás en Inicio.
      </p>
    );
  }

  return (
    <button type="button" onClick={abrir} className="text-primary flex items-center gap-1 self-center text-[12.5px] font-semibold">
      <Zap size={13} strokeWidth={2.5} />
      Guardar como atajo
    </button>
  );
}
