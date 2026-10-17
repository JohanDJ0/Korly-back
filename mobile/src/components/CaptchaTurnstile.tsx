import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colores } from '@/lib/tema';

/** La llave pública del sitio, o `undefined` si el captcha está apagado (igual que `claveDeSitioTurnstile` de la web). */
export function claveDeSitioTurnstile(): string | undefined {
  const clave = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return clave ? clave : undefined;
}

export const MENSAJE_CAPTCHA_PENDIENTE = 'Espera un momento: estamos verificando que eres una persona.';

/**
 * Turnstile no corre en código nativo: se dibuja en una "ventanita de navegador" (WebView) con una página mínima que
 * carga el widget de Cloudflare y le pasa el token a la app con `postMessage`. La app manda ese token a Supabase
 * (`options.captchaToken`), exactamente como la web (frontend/src/hooks/use-turnstile.ts); el backend no interviene.
 *
 * `baseUrl` hace que la página "viva" en https://app.korly.com.mx: Cloudflare valida el dominio del widget y ese ya está
 * permitido, así que no hay que tocar la configuración de Cloudflare. Si en un teléfono real Cloudflare no lo acepta,
 * el plan B es servir esta misma página desde la web (app.korly.com.mx/captcha-movil) y cargarla por URL, que es lo que
 * documenta Cloudflare para apps móviles.
 *
 * Requisitos de Cloudflare para WebViews: JavaScript y almacenamiento DOM encendidos, cookies permitidas (también de
 * terceros en Android) y no cambiar el user agent.
 */
function paginaDelWidget(clave: string): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;display:flex;justify-content:center;}</style>
<script>
  var idWidget;
  function enviar(mensaje) { window.ReactNativeWebView.postMessage(JSON.stringify(mensaje)); }
  function alCargar() {
    idWidget = turnstile.render('#widget', {
      sitekey: ${JSON.stringify(clave)},
      theme: 'dark',
      appearance: 'interaction-only',
      callback: function (token) { enviar({ tipo: 'token', token: token }); },
      'expired-callback': function () { enviar({ tipo: 'expirado' }); },
      'error-callback': function (codigo) { enviar({ tipo: 'error', codigo: String(codigo || '') }); return true; }
    });
  }
  function reiniciar() { if (idWidget !== undefined) turnstile.reset(idWidget); }
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=alCargar" async defer
  onerror="enviar({ tipo: 'error', codigo: 'sin_red' })"></script>
</head><body><div id="widget"></div></body></html>`;
}

export interface ControlCaptcha {
  /** Los tokens son de un solo uso: llamar después de CADA intento de envío, salga bien o mal. */
  reiniciar: () => void;
}

interface Props {
  clave: string;
  onToken: (token: string | undefined) => void;
  onFallo: (codigo: string) => void;
  fallo: string | undefined;
  ref?: Ref<ControlCaptcha>;
}

export function CaptchaTurnstile({ clave, onToken, onFallo, fallo, ref }: Props) {
  // `WebView<object>`, no `WebView` a secas: el genérico por omisión (`undefined`) vuelve `never` sus props al tiparlo.
  const webview = useRef<WebView<object>>(null);
  const html = useMemo(() => paginaDelWidget(clave), [clave]);

  useImperativeHandle(ref, () => ({
    reiniciar: () => {
      onToken(undefined);
      webview.current?.injectJavaScript('reiniciar(); true;');
    },
  }));

  function alRecibir(evento: WebViewMessageEvent) {
    try {
      const mensaje = JSON.parse(evento.nativeEvent.data) as { tipo: string; token?: string; codigo?: string };
      if (mensaje.tipo === 'token' && mensaje.token) onToken(mensaje.token);
      else if (mensaje.tipo === 'expirado') onToken(undefined);
      else if (mensaje.tipo === 'error') {
        onToken(undefined);
        onFallo(mensaje.codigo ?? '');
      }
    } catch {
      // Un mensaje que no es nuestro: se ignora.
    }
  }

  return (
    <View>
      <WebView
        ref={webview}
        source={{ html, baseUrl: 'https://app.korly.com.mx' }}
        originWhitelist={['*']}
        onMessage={alRecibir}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        scrollEnabled={false}
        style={estilos.webview}
        containerStyle={estilos.contenedor}
      />
      {fallo !== undefined && (
        <Text style={estilos.fallo}>
          No pudimos completar la verificación de seguridad. Revisa tu conexión e inténtalo de nuevo.
          {fallo ? `\nCódigo: ${fallo}` : ''}
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  // Casi siempre la verificación es invisible; si Cloudflare pide interactuar, el cuadro (~65 px) cabe aquí.
  contenedor: { height: 70, backgroundColor: 'transparent' },
  webview: { backgroundColor: 'transparent' },
  fallo: { color: colores.heroRojo, fontSize: 13, marginTop: 4 },
});

/**
 * El captcha listo para un formulario: `elemento` se pinta donde va el widget, `token` se manda a Supabase y `reiniciar`
 * se llama después de cada intento (el token es de un solo uso). Sin llave del sitio, `activo` es false y no pinta nada.
 */
export function useCaptcha() {
  const clave = claveDeSitioTurnstile();
  const control = useRef<ControlCaptcha>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [fallo, setFallo] = useState<string | undefined>(undefined);
  function alRecibirToken(nuevo: string | undefined) {
    setToken(nuevo);
    if (nuevo) setFallo(undefined);
  }
  const elemento = clave ? <CaptchaTurnstile ref={control} clave={clave} onToken={alRecibirToken} onFallo={setFallo} fallo={fallo} /> : null;
  return { activo: Boolean(clave), token, elemento, reiniciar: () => control.current?.reiniciar() };
}
