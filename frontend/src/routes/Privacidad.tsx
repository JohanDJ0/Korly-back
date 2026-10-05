import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { RESPONSABLE, VERSION_AVISO_PRIVACIDAD, hayDatosPendientes } from '@/lib/datos-responsable';
import { useAuthStore } from '@/stores/auth-store';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[16px] font-bold">{titulo}</h2>
      <div className="text-muted-foreground flex flex-col gap-2 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * Aviso de privacidad (LFPDPPP, nueva ley publicada el 20 de marzo de
 * 2025). Pública a propósito — un aviso solo vale si se puede leer ANTES
 * de entregar datos, así que vive fuera de `ProtectedRoute`. **Es un
 * borrador redactado a partir de lo que la app realmente hace; debe
 * revisarlo un abogado antes de publicarse**, y los datos del responsable
 * se llenan en `lib/datos-responsable.ts`.
 *
 * Cada afirmación describe algo verificable en el código: qué se guarda
 * (ver `TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA`, backend), con quién se
 * comparte, y cómo se ejerce cada derecho dentro de la app.
 */
export function Privacidad() {
  const haySesion = useAuthStore((s) => s.session !== null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-8 sm:py-12">
      <Link to={haySesion ? '/ajustes' : '/login'} className="text-muted-foreground flex items-center gap-1.5 text-[13px] hover:underline">
        <ArrowLeft size={15} />
        {haySesion ? 'Volver a Ajustes' : 'Volver'}
      </Link>

      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-extrabold">Aviso de privacidad</h1>
        <p className="text-muted-foreground text-[13px]">Versión {VERSION_AVISO_PRIVACIDAD}</p>
      </header>

      {hayDatosPendientes && (
        <p className="rounded-2xl border border-[#F6DE9E] bg-[#FFF6E1] p-3.5 text-[13px] text-[#5A4300] dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground">
          <strong>Borrador.</strong> Faltan datos del responsable por completar y la revisión legal antes de publicarlo.
        </p>
      )}

      <Seccion titulo="1. Quién es el responsable">
        <p>
          <strong>{RESPONSABLE.nombre}</strong> es responsable del tratamiento de tus datos personales.
        </p>
        <p>Domicilio: {RESPONSABLE.domicilio}.</p>
        <p>
          Contacto para cualquier asunto de privacidad y para ejercer tus derechos:{' '}
          <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${RESPONSABLE.correoArco}`}>
            {RESPONSABLE.correoArco}
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos guardamos">
        <p>
          <strong>Tu cuenta:</strong> correo electrónico y contraseña. La contraseña la gestiona nuestro proveedor de autenticación; nunca queda guardada en
          la base de datos de Korly.
        </p>
        <p>
          <strong>Datos financieros que tú capturas</strong> (son datos patrimoniales): tus ingresos y gastos con sus fechas, notas y categorías, tus periodos
          quincenales, tus metas de ahorro, tus gastos recurrentes y tus tarjetas de crédito con sus compras y mensualidades (nombre, límite, día de corte y
          plazo de pago que tú escribes).
        </p>
        <p>
          <strong>Preferencias y suscripción:</strong> si quieres recibir recordatorios por correo, tu plan y el estado de tu suscripción.
        </p>
        <p>
          <strong>Lo que no pedimos:</strong> números de tarjeta o de cuenta bancaria, ni conectamos con tu banco. Korly solo conoce lo que tú escribes. Al pagar
          una suscripción, el pago lo procesa Stripe en su propia página: nosotros no vemos ni guardamos el número de tu tarjeta, solo un identificador de
          cliente y el estado de la suscripción.
        </p>
      </Seccion>

      <Seccion titulo="3. Para qué los usamos">
        <p>
          Únicamente para dar el servicio: calcular cuánto puedes gastar hoy, mostrarte tus resúmenes y desgloses, autenticarte, cobrar tu suscripción si tienes
          plan de pago, y mandarte recordatorios por correo (los puedes apagar en Ajustes cuando quieras). Detectamos errores técnicos para corregirlos.
        </p>
        <p>No vendemos tus datos, no los usamos para publicidad ni para perfiles de terceros.</p>
      </Seccion>

      <Seccion titulo="4. Con quién los compartimos">
        <p>Solo con los proveedores que hacen posible el servicio y que tratan los datos por nuestra cuenta:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Supabase — autenticación y base de datos.</li>
          <li>Stripe — cobro de suscripciones.</li>
          <li>Resend — envío de recordatorios por correo.</li>
          <li>Sentry — monitoreo de errores técnicos.</li>
          <li>Nuestro proveedor de alojamiento del servidor y de la aplicación.</li>
        </ul>
        <p>No los compartimos con nadie más salvo que una autoridad competente lo requiera conforme a la ley.</p>
      </Seccion>

      <Seccion titulo="5. Tus derechos (ARCO) y cómo ejercerlos">
        <p>Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos. La mayoría los ejerces tú mismo, al instante, dentro de la app:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>Acceso:</strong> Ajustes → <em>Descargar mis datos</em> te entrega todo lo que guardamos de ti en un archivo, gratis en cualquier plan.
          </li>
          <li>
            <strong>Rectificación:</strong> puedes editar tus gastos, ingresos, categorías, metas y demás datos directamente en la app.
          </li>
          <li>
            <strong>Cancelación:</strong> Ajustes → <em>Eliminar mi cuenta</em> borra de inmediato y de forma definitiva todos tus datos, y cancela tu
            suscripción si la tienes. No se puede deshacer.
          </li>
          <li>
            <strong>Oposición:</strong> puedes dejar de recibir recordatorios por correo en Ajustes.
          </li>
        </ul>
        <p>
          También puedes escribirnos a {RESPONSABLE.correoArco}. Revocar tu consentimiento equivale a eliminar tu cuenta, porque sin tus datos el servicio no puede
          funcionar.
        </p>
      </Seccion>

      <Seccion titulo="6. Cuánto tiempo los conservamos">
        <p>
          Mientras tengas tu cuenta. Al eliminarla se borran todos tus datos de Korly. Stripe conserva por su cuenta los registros de pago que la ley le exige
          guardar.
        </p>
      </Seccion>

      <Seccion titulo="7. Consentimiento">
        <p>
          Al crear tu cuenta aceptas expresamente este aviso, incluido el tratamiento de tus datos financieros y patrimoniales para las finalidades de arriba.
          Guardamos la versión del aviso y la fecha en que lo aceptaste.
        </p>
      </Seccion>

      <Seccion titulo="8. Cambios a este aviso">
        <p>Si cambia, publicaremos la nueva versión en esta misma página con su fecha, y te avisaremos si el cambio afecta cómo usamos tus datos.</p>
      </Seccion>
    </div>
  );
}
