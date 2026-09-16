import { Button } from '@/components/ui/button';
import { useEliminarCategoria } from '@/hooks/use-eliminar-categoria';
import type { Categoria } from '@/hooks/use-categorias';

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

  function eliminar() {
    if (!window.confirm(`¿Eliminar la categoría "${categoria.nombre}"?`)) return;
    eliminarCategoria.mutate(categoria.id);
  }

  return (
    <li className="flex flex-col gap-1 border-b py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{categoria.nombre}</p>
        {categoria.esPredeterminada ? (
          <span className="shrink-0 text-sm text-muted-foreground">Predeterminada</span>
        ) : (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={eliminar} disabled={eliminarCategoria.isPending}>
            Eliminar
          </Button>
        )}
      </div>
      {eliminarCategoria.isError && <p className="text-sm text-destructive">{eliminarCategoria.error.message}</p>}
    </li>
  );
}
