import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { hayDatosPendientes } from '@/lib/datos-responsable';
import { useAuthStore } from '@/stores/auth-store';

export interface SeccionLegal {
  id: string;
  titulo: string;
  contenido: ReactNode;
}

interface DocumentoLegalProps {
  titulo: string;
  version: string;
  /** Texto corto debajo del título (opcional). */
  introduccion?: ReactNode;
  /** Bloque que va antes del índice, p. ej. el "En resumen" del aviso (opcional). */
  encabezado?: ReactNode;
  secciones: SeccionLegal[];
}

/**
 * Estructura común del aviso de privacidad y de los términos: enlace de regreso, título, aviso de datos pendientes, índice
 * con enlaces a cada sección y las secciones. Lo que cambia entre un documento y otro es solo el contenido.
 */
export function DocumentoLegal({ titulo, version, introduccion, encabezado, secciones }: DocumentoLegalProps) {
  const haySesion = useAuthStore((s) => s.session !== null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-8 sm:py-12">
      <Link to={haySesion ? '/ajustes' : '/login'} className="text-muted-foreground flex items-center gap-1.5 text-[13px] hover:underline">
        <ArrowLeft size={15} />
        {haySesion ? 'Volver a Ajustes' : 'Volver'}
      </Link>

      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-extrabold">{titulo}</h1>
        <p className="text-muted-foreground text-[13px]">Versión {version}</p>
        {introduccion && <p className="text-muted-foreground text-[14px] leading-relaxed">{introduccion}</p>}
      </header>

      {hayDatosPendientes && (
        <p className="rounded-2xl border border-[#F6DE9E] bg-[#FFF6E1] p-3.5 text-[13px] text-[#5A4300] dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground">
          <strong>Pendiente.</strong> Faltan datos del responsable por completar antes de publicar este documento.
        </p>
      )}

      {encabezado}

      <nav aria-label="Contenido" className="border-border flex flex-col gap-1.5 rounded-2xl border p-4">
        <h2 className="font-display text-[15px] font-bold">Contenido</h2>
        <ol className="text-muted-foreground flex flex-col gap-1 text-[13.5px]">
          {secciones.map((seccion) => (
            <li key={seccion.id}>
              <a href={`#${seccion.id}`} className="hover:text-foreground underline-offset-2 hover:underline">
                {seccion.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {secciones.map((seccion) => (
        <section key={seccion.id} id={seccion.id} className="flex scroll-mt-6 flex-col gap-2">
          <h2 className="font-display text-[16px] font-bold">{seccion.titulo}</h2>
          <div className="text-muted-foreground flex flex-col gap-2 text-[14px] leading-relaxed">{seccion.contenido}</div>
        </section>
      ))}
    </div>
  );
}

/** Lista con viñetas con el espaciado de los documentos legales. */
export function Lista({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>;
}

/** Subtítulo dentro de una sección. */
export function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="text-foreground pt-1 text-[14px] font-semibold">{children}</h3>;
}
