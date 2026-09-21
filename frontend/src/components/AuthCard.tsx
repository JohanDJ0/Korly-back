interface AuthCardProps {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}

/**
 * Layout compartido de Login/Registro/OlvidePassword/RestablecerPassword
 * — las cuatro repetían el mismo Card centrado con logo + título +
 * descripción. Antes usaban `full.svg` a secas; el logo real ya
 * funciona igual aquí, solo con más aire alrededor.
 */
export function AuthCard({ titulo, descripcion, children }: AuthCardProps) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-sm rounded-3xl border p-8 shadow-sm">
        <div className="flex flex-col items-center gap-1 pb-6 text-center">
          <img src="/logo/full.svg" alt="Korly" className="mb-3 h-9" />
          <h1 className="font-display text-lg font-bold">{titulo}</h1>
          <p className="text-muted-foreground text-sm">{descripcion}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
