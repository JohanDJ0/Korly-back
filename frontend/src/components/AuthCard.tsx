import { Fragment, useRef } from 'react';
import { Link } from 'react-router-dom';

import { ArteInteractivo } from '@/components/ArteInteractivo';
import { SalienteAbajo, SalienteArriba } from '@/components/escena-korly';

interface AuthCardProps {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
  /** Registro y la re-aceptación ya enlazan el aviso y los términos dentro del formulario. */
  sinPieLegal?: boolean;
}

/**
 * Pantalla de acceso compartida por Login, Registro, OlvidePassword, RestablecerPassword y ReaceptarAviso. En
 * pantallas grandes, la mitad izquierda es la escena ilustrada a todo lo ancho y alto, con algunas figuras que se
 * salen de la imagen y cruzan la raya hacia el formulario; la mitad derecha es el formulario. En el celular solo el
 * formulario. Siempre en verde oscuro (`.auth-shell`, ver index.css). Mantiene el nombre `AuthCard` y sus props
 * para que las cinco pantallas no cambien al rediseñarla.
 */
export function AuthCard({ titulo, descripcion, children, sinPieLegal }: AuthCardProps) {
  const pantalla = useRef<HTMLDivElement>(null);
  return (
    <div ref={pantalla} className="auth-shell relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0f201c] lg:block">
        <ArteInteractivo zona={pantalla} />
      </aside>

      {/* Lo que se sale de la imagen: cruza la raya (51.2 % = 1.05 / 2.05 del ancho) hacia el lado del formulario. Cada
          figura va dos veces, a color y en contornos encima, para que también cambie al pasar el cursor. */}
      <div className="pointer-events-none absolute inset-y-0 left-[51.2%] z-30 hidden w-0 lg:block" aria-hidden="true" data-testid="arte-salientes">
        {(['arte-color', 'arte-contornos'] as const).map((capa) => (
          <Fragment key={capa}>
            <svg className={`arte-saliente ${capa}`} style={{ top: '5%', left: -190 }} viewBox="0 0 320 200" focusable="false">
              <SalienteArriba />
            </svg>
            <svg className={`arte-saliente ${capa}`} style={{ bottom: '4%', left: -125 }} viewBox="0 0 320 170" focusable="false">
              <SalienteAbajo />
            </svg>
          </Fragment>
        ))}
      </div>

      <div className="flex min-h-dvh flex-col bg-[#15302a]">
        <header className="flex items-center gap-2.5 px-6 pt-6 sm:px-10 sm:pt-8">
          <img src="/logo/icon.svg" alt="" width={36} height={36} className="rounded-[10px]" />
          <span className="font-display text-[22px] font-extrabold tracking-tight">Korly</span>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="pb-7">
              <h1 className="font-display text-[30px] leading-tight font-bold">{titulo}</h1>
              <p className="text-muted-foreground mt-2 text-[15px]">{descripcion}</p>
            </div>
            {children}
          </div>
        </main>

        <footer className="text-muted-foreground flex min-h-10 flex-wrap justify-center gap-x-5 gap-y-1 px-6 pb-6 text-xs">
          {!sinPieLegal && (
            <>
              <Link to="/privacidad" className="hover:text-foreground underline-offset-4 hover:underline">
                Aviso de privacidad
              </Link>
              <Link to="/terminos" className="hover:text-foreground underline-offset-4 hover:underline">
                Términos y condiciones
              </Link>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
