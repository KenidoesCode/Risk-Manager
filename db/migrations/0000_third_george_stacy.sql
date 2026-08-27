CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"customer_key" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"return_count" integer DEFAULT 0 NOT NULL,
	"refund_count" integer DEFAULT 0 NOT NULL,
	"order_value_minor" integer DEFAULT 0 NOT NULL,
	"refund_value_minor" integer DEFAULT 0 NOT NULL,
	"distinct_categories" integer DEFAULT 0 NOT NULL,
	"tenure_days" integer DEFAULT 0 NOT NULL,
	"ground_truth_ring_id" text,
	"ground_truth_label" text,
	"split" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" bigserial NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"cluster_id" text,
	"correlation_id" text NOT NULL,
	"previous_state" jsonb,
	"new_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text NOT NULL,
	"severity" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_members" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"contribution" real DEFAULT 0 NOT NULL,
	"joined_via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"detection_run_id" text NOT NULL,
	"method" text NOT NULL,
	"account_count" integer NOT NULL,
	"entity_count" integer NOT NULL,
	"risk_score" real NOT NULL,
	"confidence" real NOT NULL,
	"verdict" text NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counter_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text,
	"explanation_source" text DEFAULT 'deterministic' NOT NULL,
	"stability" real,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detection_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"detector_version" text NOT NULL,
	"method" text NOT NULL,
	"split" text NOT NULL,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"edge_count" integer DEFAULT 0 NOT NULL,
	"derived_edge_count" integer DEFAULT 0 NOT NULL,
	"cluster_count" integer DEFAULT 0 NOT NULL,
	"data_quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"anonymized_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_run_id" text NOT NULL,
	"ring_id" text,
	"cluster_id" text,
	"template" text NOT NULL,
	"difficulty" text NOT NULL,
	"actual_label" text NOT NULL,
	"predicted_risk" real,
	"predicted_flagged" boolean,
	"abstained" boolean DEFAULT false NOT NULL,
	"classification" text NOT NULL,
	"member_overlap" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"split" text NOT NULL,
	"detector" text NOT NULL,
	"detector_version" text NOT NULL,
	"risk_threshold" real NOT NULL,
	"ring_count" integer DEFAULT 0 NOT NULL,
	"account_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb NOT NULL,
	"hard_negative_metrics" jsonb,
	"threshold_sweep" jsonb,
	"coordination_recovery" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"correlation_id" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"source_entity_id" text NOT NULL,
	"target_entity_id" text NOT NULL,
	"type" text NOT NULL,
	"derived" boolean DEFAULT false NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"provenance" text NOT NULL,
	"via_entity_id" text,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"observation_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_detail" text NOT NULL,
	"machine_verdict" text NOT NULL,
	"machine_risk" real NOT NULL,
	"machine_confidence" real NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewer_note" text,
	"reviewer_verdict" text,
	"benign_explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"product_category" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"device_key" text,
	"address_key" text,
	"payment_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_events" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"account_id" text NOT NULL,
	"reason" text NOT NULL,
	"initiated_at" timestamp with time zone NOT NULL,
	"days_after_delivery" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rings" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"template" text NOT NULL,
	"difficulty" text NOT NULL,
	"split" text NOT NULL,
	"member_account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shared_infrastructure" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_members" ADD CONSTRAINT "cluster_members_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_detection_run_id_detection_runs_id_fk" FOREIGN KEY ("detection_run_id") REFERENCES "public"."detection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_evaluation_run_id_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_entity_id_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_return_id_return_events_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."return_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_entity_idx" ON "accounts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "accounts_split_idx" ON "accounts" USING btree ("split");--> statement-breakpoint
CREATE INDEX "accounts_ring_idx" ON "accounts" USING btree ("ground_truth_ring_id");--> statement-breakpoint
CREATE INDEX "audit_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_cluster_idx" ON "audit_events" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_sequence_idx" ON "audit_events" USING btree ("sequence");--> statement-breakpoint
CREATE INDEX "members_cluster_idx" ON "cluster_members" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "members_entity_idx" ON "cluster_members" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_unique_idx" ON "cluster_members" USING btree ("cluster_id","entity_id");--> statement-breakpoint
CREATE INDEX "clusters_run_idx" ON "clusters" USING btree ("detection_run_id");--> statement-breakpoint
CREATE INDEX "clusters_risk_idx" ON "clusters" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "clusters_verdict_idx" ON "clusters" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "clusters_review_idx" ON "clusters" USING btree ("requires_review");--> statement-breakpoint
CREATE INDEX "runs_method_idx" ON "detection_runs" USING btree ("method");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "detection_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_key_idx" ON "entities" USING btree ("type","anonymized_key");--> statement-breakpoint
CREATE INDEX "entities_last_seen_idx" ON "entities" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "eval_cases_run_idx" ON "evaluation_cases" USING btree ("evaluation_run_id");--> statement-breakpoint
CREATE INDEX "eval_cases_class_idx" ON "evaluation_cases" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "eval_cases_template_idx" ON "evaluation_cases" USING btree ("template");--> statement-breakpoint
CREATE INDEX "eval_split_idx" ON "evaluation_runs" USING btree ("split");--> statement-breakpoint
CREATE INDEX "eval_started_idx" ON "evaluation_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "exceptions_kind_idx" ON "exceptions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "edges_source_idx" ON "graph_edges" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "edges_target_idx" ON "graph_edges" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "edges_type_idx" ON "graph_edges" USING btree ("type");--> statement-breakpoint
CREATE INDEX "edges_derived_idx" ON "graph_edges" USING btree ("derived");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_unique_idx" ON "graph_edges" USING btree ("source_entity_id","target_entity_id","type");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "human_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_cluster_idx" ON "human_reviews" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "orders_account_idx" ON "orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX "orders_category_idx" ON "orders" USING btree ("product_category");--> statement-breakpoint
CREATE INDEX "refunds_return_idx" ON "refund_events" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "refunds_account_idx" ON "refund_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "return_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_account_idx" ON "return_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "returns_initiated_idx" ON "return_events" USING btree ("initiated_at");--> statement-breakpoint
CREATE INDEX "rings_label_idx" ON "rings" USING btree ("label");--> statement-breakpoint
CREATE INDEX "rings_split_idx" ON "rings" USING btree ("split");--> statement-breakpoint
CREATE INDEX "rings_template_idx" ON "rings" USING btree ("template");