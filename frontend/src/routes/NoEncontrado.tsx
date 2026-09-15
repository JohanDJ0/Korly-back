import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/**
 * Hallazgo del pase de QA/UX: sin una ruta catch-all, cualquier URL no
 * reconocida (typo, marcador viejo, enlace roto) hacía que `<Routes>`
 * no renderizara nada — una pantalla en blanco sin mensaje ni forma de
 * volver. Se registra con `path="*"` en App.tsx, dentro y fuera de
 * `ProtectedRoute` no aplica aquí: un catch-all fuera de ambos grupos
 * cubre cualquier ruta no declarada sin importar si hay sesión o no.
 */
export function NoEncontrado() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La dirección a la que intentas entrar no existe.</p>
      <Button asChild>
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
