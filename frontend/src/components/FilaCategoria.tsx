import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BotonConfirmar } from '@/components/BotonConfirmar';
import { IconoPicker } from '@/components/IconoPicker';
import { useActualizarCategoria } from '@/hooks/use-actualizar-categoria';
import { useEliminarCategoria } from '@/hooks/use-eliminar-categoria';
import type { Categoria } from '@/hooks/use-categorias';
import { iconoCategoria } from '@/lib/icono-categoria';

interface FilaCategoriaProps {
  categoria: Categoria;
}

/**
 * Las predeterminadas no traen botón "Eliminar" — el backend las
 * rechaza con `CATEGORIA_PREDETERMINADA` de todas formas, pero no
 * tiene sentido ni mostrar el botón para un click que va a fallar
 * seguro (mismo criterio que un gasto ya revertido en FilaGasto.tsx).
 * Nombre e ícono sí se pueden cambiar en cualquiera de las dos — son
 * cosméticos, no chocan con esa protección (ver backend/README.md).
 */
export function FilaCategoria({ categoria }: FilaCategoriaProps) {
  const eliminarCategoria = useEliminarCategoria();
  const actualizarCategoria = useActualizarCategoria();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(categoria.nombre);
  // Hallazgo del pase de QA/UX: un nombre vacío no debe fallar en
  // silencio — mismo criterio que el resto de los formularios inline
  // (FilaGasto.tsx, FilaMeta.tsx).
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const Icono = iconoCategoria(categoria.nombre, categoria.icono);

  /** `false` = el nombre no era válido, no cierres el panel — el usuario debe ver el error y corregirlo. */
  function guardarNombre(): boolean {
    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length === 0) {
      setErrorValidacion('El nombre no puede estar vacío');
      return false;
    }
    setErrorValidacion(null);
    if (nombreLimpio !== categoria.nombre) {
      actualizarCategoria.mutate({ categoriaId: categoria.id, nombre: nombreLimpio });
    }
    return true;
  }

  if (editando) {
    return (
      <li className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
        <div className="flex items-center gap-2">
          <Input
            value={nombre}
            onChange={(evento) => {
              setNombre(evento.target.value);
              setErrorValidacion(null);
            }}
            onKeyDown={(evento) => evento.key === 'Enter' && guardarNombre()}
            autoFocus
            className="h-9 flex-1 rounded-lg"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (guardarNombre()) setEditando(false);
            }}
          >
            Listo
          </Button>
        </div>
        <IconoPicker
          value={categoria.icono}
          onChange={(clave) => actualizarCategoria.mutate({ categoriaId: categoria.id, icono: clave })}
        />
        {(errorValidacion ?? actualizarCategoria.error?.message) && (
          <p className="text-destructive text-sm">{errorValidacion ?? actualizarCategoria.error?.message}</p>
        )}
      </li>
    );
  }

  return (
    <li className="border-border bg-card flex flex-col gap-1 rounded-2xl border p-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Editar ${categoria.nombre}`}
          onClick={() => {
            setNombre(categoria.nombre);
            setErrorValidacion(null);
            setEditando(true);
          }}
          className="bg-secondary group relative flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl"
        >
          <Icono size={16} className="text-secondary-foreground group-hover:opacity-0" />
          <Pencil size={13} className="text-secondary-foreground absolute opacity-0 group-hover:opacity-100" />
        </button>
        <button
          type="button"
          onClick={() => {
            setNombre(categoria.nombre);
            setErrorValidacion(null);
            setEditando(true);
          }}
          className="min-w-0 flex-1 truncate text-left text-[14.5px] font-medium"
        >
          {categoria.nombre}
        </button>
        {categoria.esPredeterminada ? (
          <span className="text-muted-foreground shrink-0 text-xs">Predeterminada</span>
        ) : (
          <BotonConfirmar
            variant="ghost"
            size="sm"
            className="text-destructive"
            pregunta={`¿Eliminar la categoría "${categoria.nombre}"?`}
            onConfirmar={() => eliminarCategoria.mutate(categoria.id)}
            disabled={eliminarCategoria.isPending}
          >
            Eliminar
          </BotonConfirmar>
        )}
      </div>
      {eliminarCategoria.isError && <p className="text-destructive text-sm">{eliminarCategoria.error.message}</p>}
    </li>
  );
}
