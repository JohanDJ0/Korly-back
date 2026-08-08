-- Invariantes del ledger (ADR-001, modelo-dominio.md §2) que no se
-- pueden expresar como CHECK constraint de una sola fila porque
-- comparan varias filas entre sí. Se aplican con triggers para que
-- dependan de Postgres, no de que ningún caller de la aplicación se
-- acuerde de respetarlas.

-- 1) Inmutabilidad: ningún asiento ni movimiento se edita ni se borra
--    jamás. Una corrección es un movimiento de reversión nuevo.
create or replace function ledger_bloquear_mutacion() returns trigger as $$
begin
  raise exception 'Las filas de % son inmutables (ADR-001): no se editan ni se eliminan. Registre un movimiento de reversión en su lugar.', tg_table_name;
end;
$$ language plpgsql;

create trigger asientos_inmutables
  before update or delete on asientos
  for each row execute function ledger_bloquear_mutacion();

create trigger movimientos_inmutables
  before update or delete on movimientos
  for each row execute function ledger_bloquear_mutacion();

-- 2) Balance: la suma de los asientos de un mismo movimiento es
--    exactamente cero, y todos comparten moneda.
--
--    DEFERRABLE INITIALLY DEFERRED: los asientos de un movimiento se
--    insertan de a uno dentro de la misma transacción (ver
--    modulos/ledger/registrar-movimiento.ts); el chequeo debe esperar a
--    que todos existan, así que se evalúa al hacer COMMIT, no por fila.
--
--    La función corre como SECURITY INVOKER (el default): el SELECT de
--    abajo queda sujeto a la misma política RLS que todo lo demás, pero
--    eso no subcuenta filas del movimiento que se está validando —
--    el WITH CHECK de esa política ya exige que todo asiento tenga el
--    tenant_id de la sesión actual, así que los asientos de un mismo
--    movimiento comparten tenant por construcción.
create or replace function ledger_validar_balance_movimiento() returns trigger as $$
declare
  v_movimiento_id uuid := coalesce(new.movimiento_id, old.movimiento_id);
  v_suma bigint;
  v_monedas_distintas int;
begin
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

create constraint trigger asientos_balance_movimiento
  after insert or update or delete on asientos
  deferrable initially deferred
  for each row execute function ledger_validar_balance_movimiento();
