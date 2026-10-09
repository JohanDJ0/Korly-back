import type { CaptchaTurnstile } from '@/hooks/use-turnstile';

/**
 * Lugar del widget de Turnstile dentro de un formulario, más el aviso si no se pudo cargar. No ocupa espacio mientras la
 * verificación es invisible (el caso normal). Sin llave del sitio no renderiza nada.
 */
export function CaptchaDelFormulario({ captcha }: { captcha: CaptchaTurnstile }) {
  if (!captcha.activo) return null;
  return (
    <>
      <div ref={captcha.contenedor} data-testid="captcha-turnstile" />
      {captcha.fallo && (
        <p role="alert" className="text-destructive text-sm">
          No pudimos completar la verificación de seguridad. Revisa tu conexión, desactiva el bloqueador de anuncios para esta página y recarga.
          {captcha.codigoDeFallo && <span className="text-muted-foreground block text-xs">Código: {captcha.codigoDeFallo}</span>}
        </p>
      )}
    </>
  );
}
