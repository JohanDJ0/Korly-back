/**
 * Único código de servidor de la landing: manda `www.korly.com.mx` a `korly.com.mx` (redirección permanente, conserva
 * la ruta y los parámetros). Todo lo demás lo sirven los archivos estáticos de `public/`.
 *
 * Solo corre en `/` y `/index.html` (ver `run_worker_first` en wrangler.jsonc): los demás archivos se entregan directo,
 * sin pasar por este código.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.korly.com.mx') {
      url.hostname = 'korly.com.mx';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
