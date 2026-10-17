DROP INDEX "gastos_recurrente_periodo_unico";--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "corrige_gasto_id" uuid;--> statement-breakpoint
ALTER TABLE "gastos_recurrentes" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_corrige_gasto_id_gastos_id_fk" FOREIGN KEY ("corrige_gasto_id") REFERENCES "public"."gastos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_recurrente_periodo_unico" ON "gastos" USING btree ("origen_recurrente_id","periodo_id") WHERE "gastos"."origen_recurrente_id" IS NOT NULL AND "gastos"."corrige_gasto_id" IS NULL;