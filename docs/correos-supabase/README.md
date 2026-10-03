# Plantillas de correo de Supabase

Generadas con `npx tsx scripts/generar-plantillas-supabase.ts` (en `backend/`) a partir de `src/shared/plantilla-correo.ts`: no se editan a mano.

Se pegan en Supabase → Authentication → Emails → Templates. Cada plantilla lleva su asunto (*Subject*) y el HTML (*Message body*).

| Plantilla en Supabase | Asunto | Archivo |
|---|---|---|
| Confirm sign up | Confirma tu correo para empezar en Korly | `confirmacion-registro.html` |
| Reset password | Restablece tu contraseña de Korly | `recuperar-contrasena.html` |
| Change email address | Confirma tu nuevo correo en Korly | `cambio-de-correo.html` |
| Magic link | Tu enlace para entrar a Korly | `enlace-magico.html` |
| Invite user | Te invitaron a Korly | `invitacion.html` |
| Reauthentication | Tu código de verificación de Korly | `codigo-de-verificacion.html` |
