import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  titulo: string;
  accion?: React.ReactNode;
}

/**
 * Mismo "← Volver" + título que repetían Historial/Metas/Recurrentes/
 * Tarjetas/Ajustes.tsx, ahora como el encabezado del rediseño (flecha
 * circular + título grande). La flecha se oculta desde `sm:` (640px,
 * mismo corte que Sidebar.tsx/BottomNav.tsx) — ahí "volver a Inicio" ya
 * lo da el sidebar, siempre visible; el padding horizontal también se
 * apaga ahí porque lo pone el contenedor de cada página, para alinearse
 * con el sidebar en vez de sumar los dos paddings.
 */
export function PageHeader({ titulo, accion }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-2.5 sm:px-0 sm:pt-0 sm:pb-6">
      <Link
        to="/"
        aria-label="Volver"
        className="border-input bg-card flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border sm:hidden"
      >
        <ArrowLeft size={15} strokeWidth={2.3} />
      </Link>
      <h1 className="font-display flex-1 text-lg font-semibold sm:text-2xl">{titulo}</h1>
      {accion}
    </div>
  );
}
