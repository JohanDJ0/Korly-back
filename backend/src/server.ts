// Primero, a propósito: valida el entorno de producción antes de que otros
// módulos (shared/db.ts) fallen al cargarse con un error suelto.
import './shared/verificar-entorno.js';
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

// Los orquestadores avisan un despliegue con SIGTERM: dejar terminar las
// peticiones en curso (un cobro, una purga de cuenta a medias) en vez de
// cortarlas, y salir con código 0 para que no cuente como fallo.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(senal, () => {
    app.log.info(`${senal} recibido: cerrando el servidor`);
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error(error);
        process.exit(1);
      }
    );
  });
}
