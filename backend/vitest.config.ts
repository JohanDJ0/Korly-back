import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // El test de concurrencia toma un advisory lock real y las pruebas
    // de aislamiento hacen roundtrips reales a Postgres; 10s por defecto
    // es ajustado en CI con contenedores recién levantados.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
