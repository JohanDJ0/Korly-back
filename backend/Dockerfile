# Imagen del backend de Korly — sirve igual en Railway, Fly, Render o Cloud Run
# (el proyecto todavía no tiene hosting elegido; esto no ata a ninguno).
#
# Una sola imagen para dos usos, con distinto comando:
#   - API:         el CMD por defecto (node dist/server.js)
#   - Cron Job:    npx tsx scripts/enviar-recordatorios.ts   (recordatorios por correo, `0 2 * * *` UTC)
#
# Las migraciones NO corren aquí: se aplican a mano desde una máquina de
# confianza con `npm run db:migrate` (drizzle-kit es una dependencia de
# desarrollo, y aplicar una migración a producción es una decisión, no un
# efecto secundario de desplegar).

# ---- build: instala todo (incluye devDependencies) y compila TypeScript ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: ningún postinstall (p. ej. embedded-postgres, solo para pruebas) corre en la imagen.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: solo lo necesario para correr ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# El job de recordatorios corre con tsx directamente desde el código fuente
# (scripts/ importa ../src/...), por eso viajan scripts/ y src/ además de dist/.
COPY scripts ./scripts
COPY src ./src
COPY drizzle ./drizzle

USER node
EXPOSE 3000

# Vivo, no "listo": si la base cae, reiniciar el contenedor no la arregla
# (para eso está /salud/listo, que usa el balanceador, no este check).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/salud').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
