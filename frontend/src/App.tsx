import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { queryClient } from '@/lib/query-client';
import { Historial } from '@/routes/Historial';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { Registro } from '@/routes/Registro';
import { Resumen } from '@/routes/Resumen';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/historial" element={<Historial />} />
            <Route path="/historial/:periodoId" element={<Historial />} />
            <Route path="/resumen/:periodoId" element={<Resumen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
