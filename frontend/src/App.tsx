import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { queryClient } from '@/lib/query-client';
import { Historial } from '@/routes/Historial';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { Metas } from '@/routes/Metas';
import { NoEncontrado } from '@/routes/NoEncontrado';
import { OlvidePassword } from '@/routes/OlvidePassword';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { Recurrentes } from '@/routes/Recurrentes';
import { Registro } from '@/routes/Registro';
import { Resumen } from '@/routes/Resumen';
import { Tarjetas } from '@/routes/Tarjetas';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/olvide-password" element={<OlvidePassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/historial" element={<Historial />} />
            <Route path="/historial/:periodoId" element={<Historial />} />
            <Route path="/resumen/:periodoId" element={<Resumen />} />
            <Route path="/metas" element={<Metas />} />
            <Route path="/recurrentes" element={<Recurrentes />} />
            <Route path="/tarjetas" element={<Tarjetas />} />
          </Route>
          <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
