import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  titulo: string;
  accion?: React.ReactNode;
}

/** Mismo "← Volver" + título que repetían Historial/Metas/Recurrentes/Tarjetas/Ajustes.tsx, ahora como el encabezado del rediseño (flecha circular + título grande). */
export function PageHeader({ titulo, accion }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-2.5">
      <Link
        to="/"
        aria-label="Volver"
        className="border-input bg-card flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border"
      >
        <ArrowLeft size={15} strokeWidth={2.3} />
      </Link>
      <h1 className="font-display flex-1 text-lg font-semibold">{titulo}</h1>
      {accion}
    </div>
  );
}
