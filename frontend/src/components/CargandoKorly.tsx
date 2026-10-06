import { cn } from '@/lib/utils';

interface CargandoKorlyProps {
  /** Ocupa toda la pantalla (arranque de la app) en vez de ir en línea con el contenido. */
  pantallaCompleta?: boolean;
  /** Tamaño del ícono en píxeles. */
  tamano?: number;
  /** Lo que lee un lector de pantalla. */
  etiqueta?: string;
  className?: string;
}

/**
 * Indicador de carga con la marca: el ícono de Korly "respirando" dentro de un aro dorado que gira. Se usa mientras
 * se resuelve la sesión al abrir la app y mientras cargan las pantallas. Con "reducir movimiento" activado se queda
 * quieto (ver `.korly-cargando` en index.css).
 */
export function CargandoKorly({ pantallaCompleta = false, tamano: tamanoPedido = 56, etiqueta = 'Cargando', className }: CargandoKorlyProps) {
  const tamano = pantallaCompleta ? Math.max(tamanoPedido, 72) : tamanoPedido;
  const indicador = (
    <div role="status" aria-live="polite" className={cn('korly-cargando', className)} style={{ width: tamano, height: tamano }}>
      <svg className="korly-cargando__aro" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="#feb816" strokeWidth="5" strokeLinecap="round" strokeDasharray="70 220" />
      </svg>
      <img className="korly-cargando__icono" src="/logo/icon.svg" alt="" width={Math.round(tamano * 0.62)} height={Math.round(tamano * 0.62)} />
      <span className="sr-only">{etiqueta}</span>
    </div>
  );

  if (!pantallaCompleta) return indicador;
  return <div className="auth-shell flex min-h-dvh items-center justify-center">{indicador}</div>;
}
