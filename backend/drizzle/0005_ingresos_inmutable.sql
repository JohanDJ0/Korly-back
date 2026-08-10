-- Reutiliza la función de la migración 0002 (bloquea UPDATE/DELETE con
-- una excepción, usando tg_table_name para el mensaje) — no hace falta
-- una función nueva por tabla. Consistente con "nada de hard delete en
-- el dominio financiero" (CLAUDE.md): un ingreso no se edita ni se
-- borra, igual que los asientos y movimientos que genera.
create trigger ingresos_inmutables
  before update or delete on ingresos
  for each row execute function ledger_bloquear_mutacion();