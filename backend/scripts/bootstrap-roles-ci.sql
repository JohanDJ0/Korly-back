-- Variante de bootstrap-roles.sql para el Postgres efímero de CI
-- (ver .github/workflows/backend-ci.yml). La contraseña es fija a
-- propósito: el contenedor se destruye al terminar el job y no protege
-- nada real. NUNCA reutilizar esta contraseña fuera de CI.

create role app_backend with
  login
  password 'app_backend_ci'
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  nobypassrls
  noreplication;

grant usage on schema public to app_backend;
grant select, insert, update, delete on all tables in schema public to app_backend;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_backend;
