import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/App';
import { Button } from '@/components/ui/button';
import { inicializarObservabilidad } from '@/lib/observabilidad';
import '@/index.css';

inicializarObservabilidad();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {
      // Hallazgo relacionado con el pase de QA/UX (mismo espíritu que
      // agregar routes/NoEncontrado.tsx para una URL no reconocida):
      // sin esto, un error de render en cualquier componente dejaba a
      // React desmontar el árbol entero y el usuario se quedaba viendo
      // una pantalla en blanco, sin mensaje ni forma de recuperarse.
      // `Sentry.ErrorBoundary` reporta el error (si hay DSN — no-op si
      // no) Y muestra el fallback, en una sola pieza.
    }
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Algo salió mal</h1>
          <p className="text-muted-foreground">Ocurrió un error inesperado. Puedes intentar de nuevo.</p>
          <Button onClick={resetError}>Reintentar</Button>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
