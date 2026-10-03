import type { ContenidoCorreo } from './plantilla-correo.js';

/** Textos de los correos de autenticación de Supabase. Los genera scripts/generar-plantillas-supabase.ts. */
export interface Plantilla {
  archivo: string;
  nombreEnSupabase: string;
  asunto: string;
  contenido: ContenidoCorreo;
}

const SI_NO_FUISTE_TU = 'Si tú no hiciste esta solicitud, puedes ignorar este correo.';

export const PLANTILLAS: Plantilla[] = [
  {
    archivo: 'confirmacion-registro',
    nombreEnSupabase: 'Confirm sign up',
    asunto: 'Confirma tu correo para empezar en Korly',
    contenido: {
      preencabezado: 'Un paso más para activar tu cuenta.',
      titulo: 'Confirma tu correo',
      parrafos: ['Gracias por registrarte en Korly. Confirma tu correo para activar tu cuenta y empezar a ver cuánto puedes gastar cada día.'],
      boton: { texto: 'Confirmar mi correo', url: '{{ .ConfirmationURL }}' },
      notaBoton: 'Si tú no creaste esta cuenta, puedes ignorar este correo.',
    },
  },
  {
    archivo: 'recuperar-contrasena',
    nombreEnSupabase: 'Reset password',
    asunto: 'Restablece tu contraseña de Korly',
    contenido: {
      preencabezado: 'Crea una contraseña nueva para tu cuenta.',
      titulo: 'Restablece tu contraseña',
      parrafos: ['Recibimos una solicitud para cambiar la contraseña de tu cuenta de Korly. Pulsa el botón para crear una nueva.'],
      boton: { texto: 'Crear una contraseña nueva', url: '{{ .ConfirmationURL }}' },
      notaBoton: 'El enlace caduca pronto. Si no pediste el cambio, ignora este correo: tu contraseña seguirá igual.',
    },
  },
  {
    archivo: 'cambio-de-correo',
    nombreEnSupabase: 'Change email address',
    asunto: 'Confirma tu nuevo correo en Korly',
    contenido: {
      preencabezado: 'Confirma el cambio de correo de tu cuenta.',
      titulo: 'Confirma tu nuevo correo',
      parrafos: ['Pediste cambiar el correo de tu cuenta de {{ .Email }} a {{ .NewEmail }}. Confírmalo para terminar el cambio.'],
      boton: { texto: 'Confirmar el cambio', url: '{{ .ConfirmationURL }}' },
      notaBoton: SI_NO_FUISTE_TU,
    },
  },
  {
    archivo: 'enlace-magico',
    nombreEnSupabase: 'Magic link',
    asunto: 'Tu enlace para entrar a Korly',
    contenido: {
      preencabezado: 'Entra a tu cuenta con un solo clic.',
      titulo: 'Entra a Korly',
      parrafos: ['Usa este enlace para iniciar sesión en tu cuenta. Es de un solo uso.'],
      boton: { texto: 'Entrar a mi cuenta', url: '{{ .ConfirmationURL }}' },
      notaBoton: SI_NO_FUISTE_TU,
    },
  },
  {
    archivo: 'invitacion',
    nombreEnSupabase: 'Invite user',
    asunto: 'Te invitaron a Korly',
    contenido: {
      preencabezado: 'Crea tu cuenta y empieza a ordenar tu quincena.',
      titulo: 'Te invitaron a Korly',
      parrafos: ['Te invitaron a crear una cuenta en Korly, la app que te dice cuánto puedes gastar cada día de tu quincena.'],
      boton: { texto: 'Aceptar la invitación', url: '{{ .ConfirmationURL }}' },
      notaBoton: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    },
  },
  {
    archivo: 'codigo-de-verificacion',
    nombreEnSupabase: 'Reauthentication',
    asunto: 'Tu código de verificación de Korly',
    contenido: {
      preencabezado: 'Usa este código para confirmar que eres tú.',
      titulo: 'Tu código de verificación',
      parrafos: ['Escribe este código en Korly para confirmar que eres tú. Caduca en unos minutos.'],
      cifra: { etiqueta: 'Código', valor: '{{ .Token }}' },
      notaBoton: 'Nunca compartas este código con nadie. Korly jamás te lo pedirá por mensaje o llamada.',
    },
  },
];
