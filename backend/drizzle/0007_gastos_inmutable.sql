-- Reutiliza la función de la migración 0002, igual que ingresos
-- (0005_ingresos_inmutable.sql). Editar/eliminar un gasto con reversión
-- automática (openapi.yaml PATCH/DELETE /gastos/{gastoId}) está fuera
-- de alcance de este punto — hasta que exista, un gasto no se edita ni
-- se borra, punto.
create trigger gastos_inmutables
  before update or delete on gastos
  for each row execute function ledger_bloquear_mutacion();