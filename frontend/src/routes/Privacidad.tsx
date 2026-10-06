import { Link } from 'react-router-dom';

import { DocumentoLegal, Lista, Subtitulo, type SeccionLegal } from '@/components/DocumentoLegal';
import { RESPONSABLE, VERSION_AVISO_PRIVACIDAD } from '@/lib/datos-responsable';

const enlace = 'text-primary underline-offset-2 hover:underline';

/**
 * Aviso de privacidad (LFPDPPP, nueva ley publicada el 20 de marzo de 2025). Público a propósito — un aviso solo vale
 * si se puede leer ANTES de entregar datos, así que vive fuera de `ProtectedRoute`. Redactado a partir de lo que
 * la app realmente hace. **Publicado el 2026-10-06 por decisión del responsable, sin revisión de un abogado: sigue
 * pendiente de esa revisión.** Los datos del responsable vienen de `lib/datos-responsable.ts`.
 *
 * Cada afirmación describe algo verificable en el código: qué se guarda (ver `TABLAS_DEL_TENANT_EN_ORDEN_DE_PURGA`,
 * backend), qué lleva el correo del recordatorio (`construirCorreoRecordatorio`), con quién se comparte, y cómo se
 * ejerce cada derecho dentro de la app. Si cambia algo de eso, cambia aquí y se sube `VERSION_AVISO_PRIVACIDAD`.
 * El responsable (nombre y domicilio) va en la última sección, y las secciones siguen un orden de lectura natural:
 * primero el resumen, luego el detalle.
 */
function construirSecciones(): SeccionLegal[] {
  return [
    {
      id: 'datos',
      titulo: '1. Qué datos guardamos',
      contenido: (
        <>
          <Subtitulo>Tu cuenta</Subtitulo>
          <Lista>
            <li>Tu correo electrónico y tu contraseña. La contraseña la gestiona nuestro proveedor de autenticación y se guarda cifrada: nunca queda en la base de datos de Korly y ni nosotros podemos leerla.</li>
            <li>La constancia de que aceptaste este aviso y los términos: qué versión y en qué fecha.</li>
          </Lista>

          <Subtitulo>Los datos financieros que tú capturas (son datos patrimoniales)</Subtitulo>
          <Lista>
            <li>Tus ingresos y tus gastos, cada uno con su monto, su fecha, su categoría y la nota que quieras escribir.</li>
            <li>Tus periodos (las quincenas de calendario en las que llevas tus cuentas) y los resúmenes que se generan al cerrarlos.</li>
            <li>Tus metas de ahorro: nombre, objetivo y cada aporte, retiro o pago que hagas con ellas.</li>
            <li>Tus gastos recurrentes y tus categorías personalizadas.</li>
            <li>Tus tarjetas de crédito, con el nombre, el límite, el día de corte y el plazo de pago que tú escribes, y sus compras y mensualidades.</li>
          </Lista>

          <Subtitulo>Preferencias y uso del servicio</Subtitulo>
          <Lista>
            <li>Si quieres recibir recordatorios por correo, y la fecha de cada recordatorio que te mandamos (solo la fecha y el tipo, para no repetirte el mismo día).</li>
            <li>Tu plan y, si algún día contratas uno de pago, el estado de tu suscripción.</li>
            <li>La fecha en que pediste que te avisemos cuando Korly Pro esté disponible (solo si pulsaste ese botón).</li>
          </Lista>

          <Subtitulo>Datos técnicos de errores</Subtitulo>
          <p>
            Si algo falla en la app, nuestro monitoreo recibe el detalle técnico del error: tipo de navegador y de sistema, la página donde ocurrió y tu
            dirección IP. No incluye lo que capturaste en tus gastos ni tus montos.
          </p>
        </>
      ),
    },
    {
      id: 'no-pedimos',
      titulo: '2. Lo que no pedimos ni usamos',
      contenido: (
        <Lista>
          <li>Números de tarjeta de crédito o débito, números de cuenta bancaria, claves o contraseñas de tu banco. Korly no se conecta con tu banco: solo conoce lo que tú escribes.</li>
          <li>Tu ubicación, tus contactos, tus fotos, tu cámara o tu micrófono.</li>
          <li>Datos sensibles como salud, origen étnico, creencias o vida sexual. Te pedimos que no los escribas en las notas de tus gastos ni de tus metas.</li>
          <li>Cookies de publicidad o de analítica, ni herramientas que te sigan por otros sitios.</li>
          <li>Si algún día pagas una suscripción, el pago lo procesa Stripe en su propia página: nosotros no vemos ni guardamos el número de tu tarjeta, solo un identificador de cliente y el estado de la suscripción.</li>
        </Lista>
      ),
    },
    {
      id: 'finalidades',
      titulo: '3. Para qué los usamos',
      contenido: (
        <>
          <Subtitulo>Finalidades necesarias</Subtitulo>
          <p>Sin ellas Korly no puede funcionar, por eso no se pueden rechazar mientras tengas tu cuenta:</p>
          <Lista>
            <li>Crear y proteger tu cuenta, y reconocerte cuando entras.</li>
            <li>Calcular cuánto puedes gastar hoy y mostrarte tus resúmenes, desgloses e historial.</li>
            <li>Cobrar tu suscripción, si algún día contratas un plan de pago.</li>
            <li>Detectar y corregir errores técnicos y mantener la seguridad del servicio.</li>
            <li>
              Medir si el servicio funciona bien con cifras agregadas, por ejemplo cuántas cuentas registraron un gasto en su primer día. Para eso solo se miran
              marcas y conteos (si hiciste algo y cuándo), nunca tus montos, notas ni nombres.
            </li>
            <li>Atender las dudas, solicitudes y reclamaciones que nos escribas.</li>
          </Lista>

          <Subtitulo>Finalidades voluntarias</Subtitulo>
          <p>Puedes decir que no y seguir usando Korly completo:</p>
          <Lista>
            <li>Mandarte un recordatorio por correo. Viene activado al crear tu cuenta y lo apagas cuando quieras en Ajustes → Notificaciones.</li>
            <li>
              Avisarte por correo cuando Korly Pro esté disponible. Solo si tú lo pides con el botón &ldquo;Avísame&rdquo;; usamos tu correo una sola vez para eso y
              puedes retirar la petición en Ajustes → Plan.
            </li>
          </Lista>

          <Subtitulo>Lo que no hacemos</Subtitulo>
          <Lista>
            <li>No vendemos tus datos ni los cedemos a nadie para que te ofrezca cosas.</li>
            <li>No los usamos para publicidad ni para armar perfiles de terceros.</li>
            <li>
              Korly calcula tu cifra de forma automática, pero es una herramienta para ti: no toma decisiones que produzcan efectos jurídicos sobre ti ni te
              evalúa, califica o clasifica.
            </li>
          </Lista>
        </>
      ),
    },
    {
      id: 'recordatorios',
      titulo: '4. Los recordatorios por correo, en detalle',
      contenido: (
        <>
          <p>
            Si los tienes activados, un proceso automático revisa cada noche, a las 8 pm hora de México, si ya registraste algo ese día. Si no, te manda un correo
            desde recordatorios@korly.com.mx.
          </p>
          <Lista>
            <li>
              <strong>Qué dice el correo:</strong> cuántos días te quedan de tu quincena, cuánto tienes disponible y cuánto puedes gastar hoy. Es decir, incluye
              cifras de tu dinero. Para enviarlo usamos a Resend (ver la sección 5).
            </li>
            <li>
              <strong>Cuándo no te lo mandamos:</strong> si ese día ya registraste un ingreso o un gasto, o si no tienes un periodo activo.
            </li>
            <li>
              <strong>Si no lo lees:</strong> después de tres recordatorios seguidos sin que registres nada, te lo mandamos cada tres días en vez de todos los días,
              y vuelve a diario en cuanto registres algo.
            </li>
            <li>
              <strong>Cómo apagarlo:</strong> Ajustes → Notificaciones, en cualquier momento. También puedes pedirlo escribiendo a{' '}
              <a className={enlace} href={`mailto:${RESPONSABLE.correoArco}`}>
                {RESPONSABLE.correoArco}
              </a>
              .
            </li>
          </Lista>
        </>
      ),
    },
    {
      id: 'terceros',
      titulo: '5. Con quién los compartimos y dónde se guardan',
      contenido: (
        <>
          <p>
            Solo con los proveedores que hacen posible el servicio y que tratan los datos por nuestra cuenta, para lo que se indica y no para sus propios fines:
          </p>
          <Lista>
            <li>
              <strong>Supabase</strong> — autenticación y base de datos. Guarda tu correo, tu contraseña cifrada y todos tus datos. Servidores en Estados Unidos
              (Virginia).
            </li>
            <li>
              <strong>Railway</strong> — el servidor de Korly. Procesa tus datos mientras atiende lo que haces en la app y mientras prepara los recordatorios.
              Estados Unidos.
            </li>
            <li>
              <strong>Vercel</strong> — entrega las pantallas de la aplicación. No guarda tus datos financieros.
            </li>
            <li>
              <strong>Resend</strong> — envío de los recordatorios por correo. Recibe tu correo y el contenido del mensaje. Empresa de Estados Unidos.
            </li>
            <li>
              <strong>Sentry</strong> — monitoreo de errores técnicos (ver la sección 1). Estados Unidos.
            </li>
            <li>
              <strong>Stripe</strong> — cobro de suscripciones. Solo interviene si contratas un plan de pago, que todavía no existe.
            </li>
            <li>
              <strong>Cloudflare y Google</strong> — los correos que nos escribas a {RESPONSABLE.correoArco} o a {RESPONSABLE.correoSoporte} pasan por Cloudflare
              (que los reenvía) y llegan a una cuenta de correo de Google.
            </li>
          </Lista>
          <p>
            <strong>Estos proveedores guardan o procesan tus datos fuera de México, principalmente en Estados Unidos.</strong> Al aceptar este aviso consientes ese
            tratamiento. No los compartimos con nadie más, salvo que una autoridad competente lo requiera conforme a la ley.
          </p>
        </>
      ),
    },
    {
      id: 'derechos',
      titulo: '6. Tus derechos (ARCO) y cómo ejercerlos',
      contenido: (
        <>
          <p>Tienes derecho a acceder, rectificar, cancelar y oponerte al tratamiento de tus datos. La mayoría los ejerces tú mismo, al instante, dentro de la app:</p>
          <Lista>
            <li>
              <strong>Acceso:</strong> Ajustes → <em>Descargar mis datos</em> te entrega todo lo que guardamos de ti en un archivo, gratis en cualquier plan. También
              puedes pedirnos que te expliquemos cómo tratamos tus datos.
            </li>
            <li>
              <strong>Rectificación:</strong> edita tus gastos, ingresos, categorías, metas y demás datos directamente en la app, y cambia tu correo y tu
              contraseña en Ajustes → Seguridad.
            </li>
            <li>
              <strong>Cancelación:</strong> Ajustes → <em>Eliminar mi cuenta</em> borra de inmediato y de forma definitiva todos tus datos, y cancela tu
              suscripción si la tienes. No se puede deshacer.
            </li>
            <li>
              <strong>Oposición y limitar el uso:</strong> apaga los recordatorios en Ajustes → Notificaciones y retira tu petición de aviso de Korly Pro en Ajustes
              → Plan.
            </li>
          </Lista>

          <Subtitulo>Si prefieres pedirlo por correo</Subtitulo>
          <p>
            Escribe a{' '}
            <a className={enlace} href={`mailto:${RESPONSABLE.correoArco}`}>
              {RESPONSABLE.correoArco}
            </a>{' '}
            desde el mismo correo con el que tienes tu cuenta (así sabemos que eres tú) y dinos tu nombre, qué derecho quieres ejercer y qué datos te interesan. Si
            no podemos confirmar tu identidad, te pediremos un dato más. Responderemos dentro de los plazos que marca la ley.
          </p>
          <p>
            Revocar tu consentimiento para las finalidades necesarias equivale a eliminar tu cuenta, porque sin tus datos el servicio no puede funcionar. Si
            consideras que no atendimos bien tu solicitud, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, la autoridad en materia de protección de
            datos personales.
          </p>
        </>
      ),
    },
    {
      id: 'conservacion',
      titulo: '7. Cuánto tiempo los conservamos',
      contenido: (
        <Lista>
          <li>
            <strong>Tus datos de la cuenta:</strong> mientras tengas tu cuenta. Al eliminarla se borran de inmediato de la base de Korly.
          </li>
          <li>
            <strong>Copias de seguridad:</strong> hacemos copias periódicas de la base de datos y las conservamos como máximo 30 días. Tus datos pueden permanecer en
            ellas hasta ese plazo después de eliminar tu cuenta, y luego desaparecen.
          </li>
          <li>
            <strong>Registros técnicos de errores y de envío de correos:</strong> el tiempo que cada proveedor los conserva por su cuenta, normalmente de semanas a
            pocos meses.
          </li>
          <li>
            <strong>Correos que nos escribas:</strong> el tiempo necesario para atender tu solicitud y lo que la ley nos exija.
          </li>
          <li>
            <strong>Registros de pago:</strong> Stripe conserva por su cuenta los que la ley le exige guardar (hoy no hay pagos).
          </li>
        </Lista>
      ),
    },
    {
      id: 'seguridad',
      titulo: '8. Cómo los protegemos',
      contenido: (
        <>
          <Lista>
            <li>Todo viaja cifrado (HTTPS) entre tu navegador, nuestro servidor y la base de datos.</li>
            <li>Cada cuenta solo puede ver sus propios datos: el aislamiento está en la base de datos, no solo en la aplicación.</li>
            <li>Tu contraseña se guarda cifrada por nuestro proveedor de autenticación.</li>
            <li>Limitamos la cantidad de peticiones por persona para frenar abusos, y las sesiones vencen solas.</li>
            <li>El acceso de administración al servicio y a la base de datos está restringido al responsable.</li>
          </Lista>
          <p>
            Si llegara a ocurrir una vulneración de seguridad que afecte de forma significativa tus derechos, te lo diremos sin dilación, por correo, para que
            puedas tomar medidas.
          </p>
        </>
      ),
    },
    {
      id: 'menores-navegador',
      titulo: '9. Menores de edad y almacenamiento en tu navegador',
      contenido: (
        <>
          <p>Korly es para personas mayores de 18 años; no recabamos datos de menores a sabiendas. Si descubrimos que una cuenta es de un menor, la eliminaremos.</p>
          <p>
            Guardamos tu sesión en el almacenamiento de tu navegador para mantenerte dentro de la app; al cerrar sesión se borra. No usamos cookies de publicidad ni
            de analítica.
          </p>
        </>
      ),
    },
    {
      id: 'preguntas',
      titulo: '10. Preguntas frecuentes',
      contenido: (
        <>
          <Subtitulo>¿Alguien ve mis gastos?</Subtitulo>
          <p>
            Otros usuarios, nunca: cada cuenta está aislada. Quien administra Korly tiene acceso técnico a la base de datos porque es necesario para operar el
            servicio, pero la regla es no consultar tus datos salvo para atender un problema que tú reportes, por seguridad o porque una autoridad lo exija.
          </p>
          <Subtitulo>¿Qué pasa si borro un gasto?</Subtitulo>
          <p>
            Para que las cuentas siempre cuadren, el movimiento original se conserva junto con su corrección (así quedan en tus datos y en el archivo que
            descargas). Si quieres que desaparezca todo rastro de tu información, elimina tu cuenta.
          </p>
          <Subtitulo>¿Puedo llevarme mis datos?</Subtitulo>
          <p>Sí. Ajustes → Descargar mis datos te da todo en un archivo, y con el plan que incluya exportación también puedes bajar tus gastos e ingresos en CSV.</p>
          <Subtitulo>¿Pueden mandarme publicidad?</Subtitulo>
          <p>No. Los únicos correos que mandamos son los de tu cuenta, el recordatorio que activaste y el aviso de Korly Pro si lo pediste.</p>
          <Subtitulo>¿Qué pasa si Korly deja de existir?</Subtitulo>
          <p>Te avisaremos con anticipación para que descargues tus datos, y al terminar los borraremos.</p>
        </>
      ),
    },
    {
      id: 'consentimiento',
      titulo: '11. Consentimiento',
      contenido: (
        <>
          <p>
            Al crear tu cuenta aceptas expresamente este aviso y los{' '}
            <Link to="/terminos" className={enlace}>
              Términos y condiciones
            </Link>
            , incluido el tratamiento de tus datos financieros y patrimoniales para las finalidades de arriba. Guardamos la versión de ambos documentos y la fecha
            en que los aceptaste.
          </p>
          <p>
            Las finalidades voluntarias se rigen aparte: puedes negarte a ellas, o retirarlas después, sin dejar de usar Korly. Y puedes revocar tu consentimiento
            en cualquier momento, con las consecuencias que se explican en la sección 6.
          </p>
        </>
      ),
    },
    {
      id: 'cambios',
      titulo: '12. Cambios a este aviso',
      contenido: (
        <p>
          Si cambia, publicaremos la nueva versión en esta misma página con su fecha. Si el cambio afecta qué datos tratamos, para qué o con quién, al entrar a la
          app te pediremos que lo leas y lo aceptes de nuevo antes de continuar.
        </p>
      ),
    },
    {
      id: 'responsable',
      titulo: '13. Responsable del tratamiento y contacto',
      contenido: (
        <>
          <p>
            <strong>{RESPONSABLE.nombre}</strong> es responsable del tratamiento de tus datos personales.
          </p>
          <p>Domicilio para oír y recibir notificaciones: {RESPONSABLE.domicilio}.</p>
          <p>
            Para cualquier asunto de privacidad y para ejercer tus derechos:{' '}
            <a className={enlace} href={`mailto:${RESPONSABLE.correoArco}`}>
              {RESPONSABLE.correoArco}
            </a>
            . Para soporte:{' '}
            <a className={enlace} href={`mailto:${RESPONSABLE.correoSoporte}`}>
              {RESPONSABLE.correoSoporte}
            </a>
            .
          </p>
        </>
      ),
    },
  ];
}

export function Privacidad() {
  return (
    <DocumentoLegal
      titulo="Aviso de privacidad"
      version={VERSION_AVISO_PRIVACIDAD}
      encabezado={
        <aside aria-label="Resumen" className="border-border bg-card flex flex-col gap-2 rounded-2xl border p-4">
          <h2 className="font-display text-[15px] font-bold">En resumen</h2>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed">
            <li>Guardamos tu correo y lo que tú captures: ingresos, gastos, metas y tarjetas. No pedimos números de tarjeta ni de cuenta bancaria.</li>
            <li>Los usamos para darte tu cifra del día y tus resúmenes. Los recordatorios por correo son opcionales.</li>
            <li>No vendemos tus datos. Los guardan proveedores técnicos, en Estados Unidos.</li>
            <li>
              Puedes ver, corregir, descargar o borrar todo desde Ajustes, o escribirnos a{' '}
              <a className={enlace} href={`mailto:${RESPONSABLE.correoArco}`}>
                {RESPONSABLE.correoArco}
              </a>
              .
            </li>
          </ul>
        </aside>
      }
      secciones={construirSecciones()}
    />
  );
}
