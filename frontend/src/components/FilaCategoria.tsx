import { BotonConfirmar } from '@/components/BotonConfirmar';
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
 */
export function FilaCategoria({ categoria }: FilaCategoriaProps) {
  const eliminarCategoria = useEliminarCategoria();
  const Icono = iconoCategoria(categoria.nombre);

  return (
    <li className="border-border bg-card flex flex-col gap-1 rounded-2xl border p-3.5">
      <div className="flex items-center gap-3">
        <div className="bg-secondary flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl">
          <Icono size={16} className="text-secondary-foreground" />
        </div>
        <p className="flex-1 text-[14.5px] font-medium">{categoria.nombre}</p>
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
