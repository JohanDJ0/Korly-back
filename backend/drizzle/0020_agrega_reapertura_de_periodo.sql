ALTER TABLE "resumenes" DROP CONSTRAINT "resumenes_periodo_unico";--> statement-breakpoint
ALTER TABLE "periodos" DROP CONSTRAINT "periodos_estado_valido";--> statement-breakpoint
ALTER TABLE "resumenes" ADD COLUMN "anulado_en" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "resumenes_periodo_vigente_unico" ON "resumenes" USING btree ("periodo_id") WHERE anulado_en is null;--> statement-breakpoint
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_estado_valido" CHECK ("periodos"."estado" in ('borrador','activo','cerrado','archivado','descartado'));--> statement-breakpoint
-- ADR-009: la reapertura de un periodo cerrado por error anula su resumen (no
-- lo borra: el DELETE sigue bloqueado). El trigger de la migración 0009 solo
-- permitía decidir el sobrante; ahora permite UNA transición más —poner
-- anulado_en— y nada más, y solo mientras el sobrante no se haya destinado.
-- Un resumen anulado no se vuelve a modificar.
create or replace function resumenes_validar_transicion() returns trigger as $$
begin
  if old.anulado_en is not null then
    raise exception 'El resumen % está anulado: no se puede modificar', old.id;
  end if;

  if new.anulado_en is not null then
    -- Anulación. No puede arrastrar un cambio de decisión de contrabando.
    if new.decision_sobrante <> old.decision_sobrante
       or new.decision_sobrante_fecha is distinct from old.decision_sobrante_fecha then
      raise exception 'Anular el resumen % no puede cambiar la decisión del sobrante', old.id;
    end if;

    if old.decision_sobrante = 'ahorrado' then
      raise exception 'El sobrante del resumen % ya se destinó a una meta: no se puede anular', old.id;
    end if;

    -- 'arrastrado' también lo es un déficit, que se decide solo al cerrar; eso
    -- sí se puede anular mientras nadie haya reclamado el arrastre.
    if old.decision_sobrante = 'arrastrado' and exists (
         select 1 from arrastres a
         where a.resumen_id = old.id
           and (a.periodo_destino_id is not null or a.meta_destino_id is not null)) then
      raise exception 'El sobrante del resumen % ya fue reclamado por otro periodo: no se puede anular', old.id;
    end if;
  else
    -- Mismas reglas de la migración 0009 para decidir el sobrante.
    if old.decision_sobrante <> 'pendiente' then
      raise exception 'El resumen % ya tiene una decisión de sobrante (%): no se puede modificar', old.id, old.decision_sobrante;
    end if;

    if new.decision_sobrante not in ('ahorrado', 'arrastrado') then
      raise exception 'La única actualización permitida en un resumen es decidir el sobrante (a ahorrado o arrastrado) o anularlo; "%" no es una transición válida desde pendiente', new.decision_sobrante;
    end if;
  end if;

  if new.tenant_id <> old.tenant_id
     or new.periodo_id <> old.periodo_id
     or new.total_ingresos_valor_minimo <> old.total_ingresos_valor_minimo
     or new.total_gastado_valor_minimo <> old.total_gastado_valor_minimo
     or new.sobrante_valor_minimo <> old.sobrante_valor_minimo
     or new.moneda <> old.moneda
     or new.generado_en <> old.generado_en then
    raise exception 'Solo la decisión del sobrante y su anulación pueden cambiar en el resumen %', old.id;
  end if;

  return new;
end;
$$ language plpgsql;
