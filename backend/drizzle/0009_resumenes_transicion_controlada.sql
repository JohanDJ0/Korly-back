-- A diferencia de asientos/movimientos/ingresos/gastos (bloqueo total de
-- UPDATE/DELETE, migraciones 0002/0005/0007), un resumen SÍ tiene un campo
-- que debe poder escribirse una vez después del INSERT: decision_sobrante,
-- de 'pendiente' a 'ahorrado'/'arrastrado' (modelo-dominio.md §3). Este
-- trigger permite EXACTAMENTE esa transición y bloquea cualquier otra —
-- incluyendo que alguien intente alterar los montos ya generados, o que
-- decision_sobrante vuelva a 'pendiente'.
create or replace function resumenes_validar_transicion() returns trigger as $$
begin
  if old.decision_sobrante <> 'pendiente' then
    raise exception 'El resumen % ya tiene una decisión de sobrante (%): no se puede modificar', old.id, old.decision_sobrante;
  end if;

  -- No basta comparar new <> old aquí: un UPDATE que deja decision_sobrante
  -- sin tocar (sigue en 'pendiente') también debe rechazarse, y "sigue
  -- pendiente" es indistinguible de "volvió a pendiente" comparando solo
  -- old vs new. La única transición válida es un destino explícito.
  if new.decision_sobrante not in ('ahorrado', 'arrastrado') then
    raise exception 'La única actualización permitida en un resumen es decidir el sobrante (a ahorrado o arrastrado); "%" no es una transición válida desde pendiente', new.decision_sobrante;
  end if;

  if new.tenant_id <> old.tenant_id
     or new.periodo_id <> old.periodo_id
     or new.total_ingresos_valor_minimo <> old.total_ingresos_valor_minimo
     or new.total_gastado_valor_minimo <> old.total_gastado_valor_minimo
     or new.sobrante_valor_minimo <> old.sobrante_valor_minimo
     or new.moneda <> old.moneda
     or new.generado_en <> old.generado_en then
    raise exception 'Solo decision_sobrante y decision_sobrante_fecha pueden cambiar en el resumen %', old.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger resumenes_transicion_controlada
  before update on resumenes
  for each row execute function resumenes_validar_transicion();

-- Igual que ingresos/gastos: nunca se elimina un resumen (CLAUDE.md,
-- "nada de hard delete en el dominio financiero"). Reutiliza la función
-- de la migración 0002.
create trigger resumenes_sin_delete
  before delete on resumenes
  for each row execute function ledger_bloquear_mutacion();