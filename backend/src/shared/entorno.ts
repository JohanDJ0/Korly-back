export interface ProblemasDeEntorno {
  /** Impiden arrancar en producción: la app funcionaría mal o, peor, insegura. */
  errores: string[];
  /** Se avisan en el log pero no impiden arrancar. */
  avisos: string[];
}

const ES_LOCAL = /localhost|127\.0\.0\.1|\[::1\]/i;
const VARIABLES_STRIPE = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_MENSUAL', 'STRIPE_PRICE_ANUAL'] as const;

function usuarioDe(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    return null;
  }
}

/**
 * Qué falta o está mal configurado para correr en producción. Función
 * pura, sin tocar `process.env` ni salir del proceso, para poder probarla;
 * `verificar-entorno.ts` es quien la llama al arrancar.
 *
 * Los errores son configuraciones que fallan **en silencio** o debilitan
 * una defensa, no solo variables ausentes: el servidor conectado con el
 * rol de administración se salta RLS por completo (ADR-005); un
 * `CORS_ORIGIN`/`FRONTEND_URL` que se queda en el valor de desarrollo
 * rompe el frontend o manda al usuario de vuelta a `localhost` desde
 * Stripe; y una integración de Stripe a medias (p. ej. clave sin secreto
 * del webhook) acepta cobros pero nunca activa el plan.
 */
export function validarEntorno(env: Record<string, string | undefined>): ProblemasDeEntorno {
  const errores: string[] = [];
  const avisos: string[] = [];

  for (const nombre of ['DATABASE_URL', 'APP_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[nombre]) errores.push(`Falta ${nombre}.`);
  }

  if (env.APP_DATABASE_URL) {
    const usuario = usuarioDe(env.APP_DATABASE_URL);
    if (usuario === null) {
      errores.push('APP_DATABASE_URL no es una URL válida.');
    } else if (!usuario.startsWith('app_backend')) {
      errores.push(
        `APP_DATABASE_URL conecta como "${usuario}": el servidor debe usar el rol app_backend (sin BYPASSRLS). Con un rol de administración, RLS no protege a nadie (ADR-005).`
      );
    }
    if (env.DATABASE_URL && env.APP_DATABASE_URL === env.DATABASE_URL) {
      errores.push('APP_DATABASE_URL y DATABASE_URL son iguales: el servidor estaría corriendo con la conexión de administración.');
    }
  }

  for (const nombre of ['CORS_ORIGIN', 'FRONTEND_URL'] as const) {
    const valor = env[nombre];
    if (!valor) {
      errores.push(`Falta ${nombre}: su valor por defecto es el de desarrollo (localhost) y en producción rompería el frontend.`);
    } else if (ES_LOCAL.test(valor)) {
      errores.push(`${nombre} apunta a localhost (${valor}).`);
    }
  }

  const stripeConfiguradas = VARIABLES_STRIPE.filter((nombre) => env[nombre]);
  if (stripeConfiguradas.length > 0 && stripeConfiguradas.length < VARIABLES_STRIPE.length) {
    const faltan = VARIABLES_STRIPE.filter((nombre) => !env[nombre]);
    errores.push(`Stripe a medias: faltan ${faltan.join(', ')}. O se configura todo o nada.`);
  }
  if (stripeConfiguradas.length === 0) {
    avisos.push('Stripe no está configurado: nadie podrá suscribirse a Pro.');
  } else if (env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    avisos.push('STRIPE_SECRET_KEY es de modo prueba: los cobros no serán reales.');
  }

  if (env.COBROS_HABILITADOS === 'true') {
    // Prenderlos con la cuenta de Stripe en modo prueba dejaría a cualquiera subir a Pro con la tarjeta 4242: es un error, no un aviso.
    if (env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      errores.push('COBROS_HABILITADOS=true con STRIPE_SECRET_KEY de modo prueba: cualquiera podría activar Pro gratis con una tarjeta de prueba.');
    }
    if (stripeConfiguradas.length === 0) {
      errores.push('COBROS_HABILITADOS=true pero Stripe no está configurado.');
    }
  } else {
    avisos.push('COBROS_HABILITADOS no es "true": el checkout y el portal de Stripe están apagados (Korly Pro aparece como "próximamente").');
  }

  if (!env.RESEND_API_KEY) avisos.push('Falta RESEND_API_KEY: los recordatorios por correo no se enviarán.');
  if (!env.SENTRY_DSN) avisos.push('Falta SENTRY_DSN: los errores en producción no se reportarán.');
  if (env.TRUST_PROXY !== 'true') {
    avisos.push('TRUST_PROXY no es "true": si hay un proxy delante, el límite de peticiones por IP será uno solo compartido por todos los usuarios.');
  }

  return { errores, avisos };
}
