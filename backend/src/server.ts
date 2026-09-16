import 'dotenv/config';
import { crearApp } from './app.js';
import { inicializarObservabilidad } from './shared/observabilidad.js';

inicializarObservabilidad();

const puerto = Number(process.env.PORT ?? 3000);
const app = crearApp();

app.listen({ port: puerto, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
