CREATE TABLE "atajos_gasto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"monto_valor_minimo" bigint NOT NULL,
	"moneda" text NOT NULL,
	"categoria_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atajos_gasto_nombre_unico_por_tenant" UNIQUE("tenant_id","nombre"),
	CONSTRAINT "atajos_gasto_monto_positivo" CHECK ("atajos_gasto"."monto_valor_minimo" > 0),
	CONSTRAINT "atajos_gasto_nombre_no_vacio" CHECK (length(btrim("atajos_gasto"."nombre")) > 0)
);
--> statement-breakpoint
ALTER TABLE "atajos_gasto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "atajos_gasto" ADD CONSTRAINT "atajos_gasto_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atajos_gasto" ADD CONSTRAINT "atajos_gasto_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "atajos_gasto_aislamiento_tenant" ON "atajos_gasto" AS PERMISSIVE FOR ALL TO "app_backend" USING ("atajos_gasto"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("atajos_gasto"."tenant_id" = current_setting('app.tenant_id', true)::uuid);