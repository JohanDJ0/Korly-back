-- Ejecutar UNA SOLA VEZ por entorno (Supabase SQL Editor o psql), antes de
-- correr `npm run db:migrate` por primera vez. No se versiona la contraseña
-- real: reemplazar <PASSWORD> y guardarla solo en el gestor de secretos / .env
-- local (ver APP_DATABASE_URL en .env.example).
--
-- Por qué existe este rol (ADR-005, docs/adr/005-tenant-id-rls.md):
-- el rol "postgres" que Supabase entrega por defecto puede saltarse RLS
-- (BYPASSRLS). Si el backend sirviera requests con ese rol, las políticas
-- de aislamiento por tenant definidas en src/db/schema/*.ts dejarían de
-- aplicarse SIN error visible — cada tenant vería los datos de todos.
-- app_backend es un rol sin privilegios especiales: Postgres sí evalúa
-- las políticas para él.

create role app_backend with
  login
  password '<PASSWORD>'
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  nobypassrls
  noreplication;

grant usage on schema public to app_backend;
grant select, insert, update, delete on all tables in schema public to app_backend;

-- Para que las tablas creadas por migraciones futuras también concedan
-- estos permisos a app_backend sin repetir este paso manualmente.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_backend;
