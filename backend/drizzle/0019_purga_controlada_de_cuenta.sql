-- ADR-008: purga controlada de una cuenta (derecho de cancelación, LFPDPPP).
--
-- ADR-001 sigue en pie para una cuenta viva: nada se edita ni se borra, ni
-- siquiera por un bug de la aplicación. Lo único que cambia es que existe
-- UN camino explícito para borrar TODO lo de un tenant cuando su titular
-- cierra su cuenta (modulos/cuenta/eliminar-cuenta.ts). Ese camino exige
-- las dos cosas a la vez:
--
--   1. que la transacción lo declare (`app.purga_cuenta = 'on'`, local a la
--      transacción: `set_config(..., true)`), y
--   2. que la sesión NO sea `app_backend`, el rol con el que el servidor
--      atiende cada request — solo la conexión de administración
--      (shared/db-admin.ts) puede purgar. Un bug (o una inyección) bajo el
--      rol normal no puede borrar historial aunque fije el parámetro.
--
-- Solo se abre el DELETE: un UPDATE sigue bloqueado siempre.

create or replace function ledger_purga_autorizada() returns boolean as $$
  select coalesce(current_setting('app.purga_cuenta', true), '') = 'on'
     and current_user <> 'app_backend';
$$ language sql stable;

-- Misma función y mismo mensaje de siempre (0002); usada por asientos,
-- movimientos, ingresos, gastos y el DELETE de resumenes.
create or replace function ledger_bloquear_mutacion() returns trigger as $$
begin
  if tg_op = 'DELETE' and ledger_purga_autorizada() then
    return old;
  end if;
  raise exception 'Las filas de % son inmutables (ADR-001): no se editan ni se eliminan. Registre un movimiento de reversión en su lugar.', tg_table_name;
end;
$$ language plpgsql;

-- El chequeo de balance (0002) corre diferido al COMMIT y, al borrar todos
-- los asientos de un movimiento, vería una suma NULL (no 0) y rechazaría
-- la purga. Se omite solo en un DELETE autorizado; un INSERT/UPDATE se
-- valida exactamente igual que antes.
create or replace function ledger_validar_balance_movimiento() returns trigger as $$
declare
  v_movimiento_id uuid := coalesce(new.movimiento_id, old.movimiento_id);
  v_suma bigint;
  v_monedas_distintas int;
begin
  if tg_op = 'DELETE' and ledger_purga_autorizada() then
    return null;
  end if;

  select sum(monto_valor_minimo), count(distinct moneda)
    into v_suma, v_monedas_distintas
    from asientos
    where movimiento_id = v_movimiento_id;

  if v_suma is distinct from 0 then
    raise exception 'El movimiento % no está balanceado: la suma de sus asientos es % (debe ser 0)',
      v_movimiento_id, v_suma;
  end if;

  if v_monedas_distintas > 1 then
    raise exception 'El movimiento % mezcla más de una moneda entre sus asientos', v_movimiento_id;
  end if;

  return null; -- trigger AFTER: el valor de retorno se ignora
end;
$$ language plpgsql;
