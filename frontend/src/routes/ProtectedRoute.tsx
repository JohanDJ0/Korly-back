import { Navigate, Outlet } from 'react-router-dom';

import { RestablecerPassword } from '@/routes/RestablecerPassword';
import { useAuthStore } from '@/stores/auth-store';

/**
 * El link de "olvidé mi contraseña" redirige siempre a la raíz (`/`,
 * dentro de esta ruta protegida) con el token en el hash de la URL —
 * Supabase ya autentica con ese token solo (evento `PASSWORD_RECOVERY`,
 * ver stores/auth-store.ts). Sin este chequeo, esa sesión temporal
 * dejaría pasar directo a Home sin darle al usuario oportunidad de
 * poner una contraseña nueva.
 */
export function ProtectedRoute() {
  const session = useAuthStore((s) => s.session);
  const cargando = useAuthStore((s) => s.cargando);
  const esRecuperacion = useAuthStore((s) => s.esRecuperacion);

  if (cargando) return null;
  if (esRecuperacion) return <RestablecerPassword />;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
