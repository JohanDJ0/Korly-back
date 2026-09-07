import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth-store';

export function ProtectedRoute() {
  const session = useAuthStore((s) => s.session);
  const cargando = useAuthStore((s) => s.cargando);

  if (cargando) return null;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
