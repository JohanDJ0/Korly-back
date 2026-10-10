import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthCard } from '@/components/AuthCard';
import { BotonAuth } from '@/components/BotonAuth';
import { CargandoKorly } from '@/components/CargandoKorly';
import { constanciaDeAviso } from '@/lib/datos-responsable';
import { mensajeDeErrorAuth } from '@/lib/errores-auth';
import { supabase } from '@/lib/supabase';

/**
 * Se muestra en vez de la app cuando la cuenta no ha aceptado la versión
 * vigente del aviso de privacidad (`aceptoAvisoVigente`): cuentas anteriores a
 * la casilla de registro o a un cambio del aviso. La ley nueva exige
 * consentimiento cuando cambian las finalidades, así que no basta con
 * publicar el texto: hay que pedir que se acepte otra vez y guardar la
 * constancia (versión y fecha) en los metadatos de la cuenta, igual que al registrarse.
 *
 * Al guardar, Supabase emite `USER_UPDATED`, el store de sesión se actualiza
 * y `ProtectedRoute` deja pasar solo.
 */
export function ReaceptarAviso() {
  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aceptar() {
    setGuardando(true);
    setError(null);
    const { error: errorDeAuth } = await supabase.auth.updateUser({ data: constanciaDeAviso() });
    setGuardando(false);
    if (errorDeAuth) setError(mensajeDeErrorAuth(errorDeAuth));
  }

  return (
    <AuthCard titulo="Actualizamos nuestros términos y aviso" descripcion="Para seguir usando Korly necesitamos que los leas y los aceptes de nuevo." sinPieLegal>
      <div className="flex flex-col gap-4">
        <label className="flex items-start gap-2.5 text-[13px] leading-snug">
          <input type="checkbox" className="accent-primary mt-0.5 h-4 w-4 shrink-0" checked={acepta} onChange={(evento) => setAcepta(evento.target.checked)} />
          <span>
            He leído y acepto los{' '}
            <Link to="/terminos" target="_blank" className="text-primary font-medium underline-offset-4 hover:underline">
              Términos y condiciones
            </Link>{' '}
            y el{' '}
            <Link to="/privacidad" target="_blank" className="text-primary font-medium underline-offset-4 hover:underline">
              Aviso de privacidad
            </Link>
            , incluido el tratamiento de mis datos financieros.
          </span>
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <BotonAuth disabled={!acepta || guardando} onClick={() => void aceptar()}>
          {guardando && <CargandoKorly tamano={22} etiqueta="Guardando" className="text-[#3b2a00]" />}
          {guardando ? 'Guardando…' : 'Aceptar y continuar'}
        </BotonAuth>
        <BotonAuth variante="plano" disabled={guardando} onClick={() => void supabase.auth.signOut()}>
          Cerrar sesión
        </BotonAuth>
      </div>
    </AuthCard>
  );
}
