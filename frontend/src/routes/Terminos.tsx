import { Link } from 'react-router-dom';

import { DocumentoLegal, Lista, Subtitulo, type SeccionLegal } from '@/components/DocumentoLegal';
import { RESPONSABLE, VERSION_TERMINOS } from '@/lib/datos-responsable';

const enlace = 'text-primary underline-offset-2 hover:underline';

/**
 * Términos y condiciones de uso: las reglas del servicio entre Korly y quien lo usa (qué es, qué no es, cómo funciona,
 * qué se espera de cada parte). Es distinto del aviso de privacidad, que es una obligación de la ley de datos
 * personales y habla solo de los datos — lo que el aviso ya dice NO se repite aquí, solo se remite a él. Por eso
 * tampoco está el domicilio: vive una sola vez, en el aviso (sección "Responsable"), que es donde la ley lo exige.
 * **Antes de vender Korly Pro hay que agregarlo aquí** (y un teléfono): la ley del consumidor lo pide en las
 * transacciones electrónicas (LFPC art. 76 Bis) — ver docs/plan-pro.md.
 *
 * Quién ofrece el servicio (el nombre) va en la última sección, a propósito.
 *
 * Pública por la misma razón que el aviso: se tiene que poder leer ANTES de crear la cuenta. Redactado a partir de lo que
 * la app realmente hace. **Publicado el 2026-10-06 por decisión del responsable, sin revisión de un abogado: sigue
 * pendiente de esa revisión.** Si algo de la
 * sección "Cómo funciona" o "Planes" cambia en la app, cambia aquí y se sube `VERSION_TERMINOS`.
 */
function construirSecciones(): SeccionLegal[] {
  return [
    {
      id: 'definiciones',
      titulo: '1. Qué significan algunas palabras',
      contenido: (
        <Lista>
          <li>
            <strong>Korly:</strong> la aplicación web y el servicio que la acompaña.
          </li>
          <li>
            <strong>Tú:</strong> la persona que crea una cuenta y usa Korly.
          </li>
          <li>
            <strong>Periodo:</strong> el tramo de calendario para el que llevas tus cuentas. Korly usa quincenas de calendario: del 1 al 15 y del 16 al último día del
            mes (así que la segunda quincena dura 13, 14, 15 o 16 días según el mes).
          </li>
          <li>
            <strong>Disponible:</strong> lo que te queda por gastar en el periodo, según lo que capturaste.
          </li>
          <li>
            <strong>Cifra diaria:</strong> el disponible entre los días que te quedan. Se redondea hacia abajo, para que el error siempre quede a tu favor.
          </li>
          <li>
            <strong>Meta:</strong> un monto que apartas por separado de tu quincena, como un viaje o un fondo de emergencia.
          </li>
          <li>
            <strong>Plan gratuito y Korly Pro:</strong> los dos niveles del servicio (ver la sección 6).
          </li>
        </Lista>
      ),
    },
    {
      id: 'que-es',
      titulo: '2. Qué es Korly y qué no es',
      contenido: (
        <>
          <p>
            Korly te ayuda a llevar el registro de tus ingresos y gastos y a calcular cuánto puedes gastar hoy sin quedarte corto antes de tu siguiente ingreso.
          </p>
          <p>
            <strong>No es asesoría financiera, fiscal, contable ni legal.</strong> No te recomienda en qué gastar, ahorrar o invertir, ni sustituye a un profesional.
          </p>
          <Lista>
            <li>Las cifras salen de lo que tú capturas: si falta algo por anotar, la cifra no lo sabe y puede ser más alegre de lo real.</li>
            <li>Korly no se conecta con tu banco, no mueve ni guarda tu dinero, y no sabe cuánto tienes de verdad en tus cuentas.</li>
            <li>Las decisiones sobre tu dinero son tuyas.</li>
          </Lista>
        </>
      ),
    },
    {
      id: 'como-funciona',
      titulo: '3. Cómo funciona',
      contenido: (
        <>
          <Subtitulo>Tu quincena</Subtitulo>
          <p>
            Registras cuánto recibiste y Korly calcula cuánto puedes gastar cada día hasta el fin del periodo. Cuando gastas algo, lo registras y la cifra se
            ajusta. Si un gasto es mayor que lo que tienes disponible, la app te pide confirmarlo antes de guardarlo: te avisa, no te bloquea, porque lo importante es
            que tu registro refleje la realidad.
          </p>
          <Subtitulo>Cerrar y reabrir un periodo</Subtitulo>
          <p>
            El periodo se cierra solo al terminar la quincena y genera un resumen. También puedes cerrarlo antes en Ajustes, y si lo cerraste por error puedes
            reabrirlo desde su resumen. Al cerrar, si te sobró dinero, decides si lo ahorras en una meta o lo arrastras a la siguiente quincena.
          </p>
          <Subtitulo>Correcciones</Subtitulo>
          <p>
            Para que las cuentas siempre cuadren, un movimiento ya registrado no se edita en silencio: al corregirlo o eliminarlo se registra una corrección y el
            historial conserva ambos.
          </p>
          <Subtitulo>Metas, tarjetas y gastos recurrentes</Subtitulo>
          <Lista>
            <li>Una meta nunca puede quedar con saldo negativo: no puedes sacar o pagar con ella más de lo que tiene.</li>
            <li>No puedes aportar a una meta más de lo que tienes disponible en la quincena.</li>
            <li>Las tarjetas y las compras a meses sin intereses te ayudan a ver tus compromisos futuros; Korly solo registra lo que tú escribes.</li>
            <li>Los gastos recurrentes (como una renta o una suscripción) los das de alta una vez y Korly los registra por ti en cada periodo.</li>
          </Lista>
          <Subtitulo>Recordatorios</Subtitulo>
          <p>
            Si los activas, te mandamos un correo por la noche cuando no has registrado nada ese día. Los puedes apagar en Ajustes. Cómo funcionan está explicado
            en el{' '}
            <Link to="/privacidad" className={enlace}>
              Aviso de privacidad
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'tu-cuenta',
      titulo: '4. Tu cuenta',
      contenido: (
        <>
          <Lista>
            <li>Debes ser mayor de 18 años.</li>
            <li>Los datos de tu cuenta deben ser verdaderos y mantenerse al día; puedes cambiar tu correo y tu contraseña en Ajustes → Seguridad.</li>
            <li>Cada cuenta es para una sola persona. No la compartas.</li>
            <li>Cuida tu contraseña. Lo que se haga con tu sesión abierta es responsabilidad tuya, así que cierra sesión en equipos que no sean tuyos.</li>
            <li>
              Si sospechas que alguien entró a tu cuenta, cambia tu contraseña y escríbenos a{' '}
              <a className={enlace} href={`mailto:${RESPONSABLE.correoSoporte}`}>
                {RESPONSABLE.correoSoporte}
              </a>
              .
            </li>
          </Lista>
          <p>
            Lo que capturas es tuyo. Nos autorizas únicamente a guardarlo y procesarlo para darte el servicio, como explica el Aviso de privacidad. Registra solo
            información tuya y no escribas datos sensibles de otras personas en las notas.
          </p>
        </>
      ),
    },
    {
      id: 'uso-aceptable',
      titulo: '5. Uso aceptable',
      contenido: (
        <>
          <p>Para que Korly funcione bien para todos, no puedes:</p>
          <Lista>
            <li>intentar entrar a la cuenta o a los datos de otra persona, ni probar la seguridad del servicio sin permiso;</li>
            <li>sobrecargar o alterar el servicio, automatizar su uso de forma que lo dañe, o saltarte sus límites de seguridad;</li>
            <li>usar Korly para actividades ilícitas, como ocultar o lavar dinero;</li>
            <li>copiar el servicio, su diseño o su código para revenderlo o ponerlo como propio.</li>
          </Lista>
          <p>Si incumples esto, podemos limitar o suspender tu cuenta, avisándote cuando sea posible y dándote oportunidad de descargar tus datos.</p>
        </>
      ),
    },
    {
      id: 'planes',
      titulo: '6. Planes',
      contenido: (
        <>
          <Subtitulo>Plan gratuito</Subtitulo>
          <p>Hoy Korly es gratuito. Incluye la cifra del día, el registro de ingresos y gastos, categorías, recordatorios, tarjetas, gastos recurrentes y metas, con estos límites:</p>
          <Lista>
            <li>Hasta 2 metas de ahorro.</li>
            <li>El historial de los últimos 12 meses.</li>
            <li>Hasta 30 categorías personalizadas.</li>
            <li>Sin exportación de gastos e ingresos a CSV (la descarga de todos tus datos de Ajustes sí es gratis, siempre).</li>
          </Lista>
          <Subtitulo>Korly Pro</Subtitulo>
          <p>
            <strong>Korly Pro todavía no se vende.</strong> Lo que se ha planeado, sin fecha ni garantía de que salga igual, incluye metas sin límite, historial completo,
            exportación a CSV, alertas de ritmo y funciones para compartir (como un presupuesto en pareja o familia y metas en común).
          </p>
          <p>
            Cuando exista, verás su precio y sus condiciones completas —renovación, cancelación y reembolsos— antes de cualquier cobro, y no se te cobrará nada sin
            que lo contrates de forma expresa. Pedir que te avisemos cuando esté disponible no te compromete a nada.
          </p>
          <Subtitulo>Cambios en los planes</Subtitulo>
          <p>Los límites y funciones del plan gratuito pueden cambiar con el tiempo. Si el cambio te afecta de forma importante, te avisaremos con anticipación.</p>
        </>
      ),
    },
    {
      id: 'disponibilidad',
      titulo: '7. Disponibilidad y cambios en el servicio',
      contenido: (
        <>
          <p>
            Hacemos lo posible por que Korly funcione sin interrupciones, pero lo ofrecemos tal como está: no garantizamos que esté siempre disponible ni libre de
            errores, y a veces necesitaremos pausarlo para darle mantenimiento.
          </p>
          <p>
            Podemos cambiar, mejorar o retirar funciones. Si retiramos algo que usas de forma importante, te avisaremos con anticipación razonable.
          </p>
        </>
      ),
    },
    {
      id: 'tus-datos',
      titulo: '8. Tus datos, copias de seguridad y cómo irte',
      contenido: (
        <>
          <Lista>
            <li>
              <strong>Son tuyos.</strong> El Aviso de privacidad explica qué guardamos y para qué.
            </li>
            <li>
              <strong>Descárgalos de vez en cuando.</strong> Hacemos copias de seguridad periódicas, pero no garantizamos que siempre se puedan recuperar. Ajustes →
              Descargar mis datos te entrega todo en un archivo, gratis.
            </li>
            <li>
              <strong>Puedes irte cuando quieras.</strong> Ajustes → Eliminar mi cuenta borra tus datos de forma definitiva; no se puede deshacer.
            </li>
            <li>
              <strong>Si dejáramos de ofrecer Korly,</strong> te avisaremos con anticipación para que descargues tus datos y después los borraremos.
            </li>
          </Lista>
        </>
      ),
    },
    {
      id: 'propiedad',
      titulo: '9. Propiedad intelectual',
      contenido: (
        <p>
          El nombre Korly, su logotipo, su diseño y su código son de su titular. Te damos una licencia personal, limitada y revocable para usar la aplicación mientras
          tengas tu cuenta. Eso no te da ningún derecho sobre la marca ni sobre el código.
        </p>
      ),
    },
    {
      id: 'responsabilidad',
      titulo: '10. Responsabilidad',
      contenido: (
        <>
          <p>En la medida que la ley lo permita, no somos responsables de:</p>
          <Lista>
            <li>las decisiones que tomes con base en las cifras de Korly;</li>
            <li>datos que no hayas anotado o que hayas anotado mal;</li>
            <li>pérdidas indirectas, como intereses, recargos o cargos de tus bancos;</li>
            <li>interrupciones o fallas ajenas a nosotros, como las de nuestros proveedores de internet, alojamiento o correo, o casos de fuerza mayor.</li>
          </Lista>
          <p>Nada de esto limita los derechos que la ley te reconoce como consumidor.</p>
        </>
      ),
    },
    {
      id: 'terminacion',
      titulo: '11. Terminación de la cuenta',
      contenido: (
        <p>
          Tú puedes eliminar tu cuenta cuando quieras. Nosotros podemos suspenderla o cerrarla si incumples estos términos, si es necesario por seguridad o si la ley lo
          exige, y siempre que sea posible te avisaremos antes y te daremos oportunidad de descargar tus datos.
        </p>
      ),
    },
    {
      id: 'cambios',
      titulo: '12. Cambios a estos términos',
      contenido: (
        <p>
          Podemos actualizarlos. Publicaremos la nueva versión en esta página y, si el cambio afecta tus derechos o cómo usas Korly, al entrar a la app te pediremos que
          la leas y la aceptes de nuevo antes de continuar. Si no estás de acuerdo, puedes descargar tus datos y eliminar tu cuenta.
        </p>
      ),
    },
    {
      id: 'ley-aplicable',
      titulo: '13. Ley aplicable y jurisdicción',
      contenido: (
        <>
          <p>
            Antes de nada, escríbenos: casi todo se resuelve hablando. Si no se resuelve, estos términos se rigen por las leyes de México y, para cualquier controversia,
            los tribunales de {RESPONSABLE.jurisdiccion}, sin perjuicio de tu derecho de acudir ante la Procuraduría Federal del Consumidor (Profeco) cuando corresponda.
          </p>
        </>
      ),
    },
    {
      id: 'contacto',
      titulo: '14. Quién ofrece Korly y cómo contactarnos',
      contenido: (
        <>
          <p>
            Korly es un servicio de <strong>{RESPONSABLE.nombre}</strong>.
          </p>
          <p>
            Dudas o soporte:{' '}
            <a className={enlace} href={`mailto:${RESPONSABLE.correoSoporte}`}>
              {RESPONSABLE.correoSoporte}
            </a>
            . Asuntos de datos personales: consulta el{' '}
            <Link to="/privacidad" className={enlace}>
              Aviso de privacidad
            </Link>
            .
          </p>
        </>
      ),
    },
  ];
}

export function Terminos() {
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      version={VERSION_TERMINOS}
      introduccion={
        <>
          Estas son las reglas para usar Korly. Al crear tu cuenta las aceptas, junto con el{' '}
          <Link to="/privacidad" className={enlace}>
            Aviso de privacidad
          </Link>
          , que explica qué hacemos con tus datos.
        </>
      }
      secciones={construirSecciones()}
    />
  );
}
