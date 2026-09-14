CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"es_predeterminada" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_nombre_unico_por_tenant" UNIQUE("tenant_id","nombre")
);
--> statement-breakpoint
ALTER TABLE "categorias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "categoria_id" uuid;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "categorias_aislamiento_tenant" ON "categorias" AS PERMISSIVE FOR ALL TO "app_backend" USING ("categorias"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("categorias"."tenant_id" = current_setting('app.tenant_id', true)::uuid);