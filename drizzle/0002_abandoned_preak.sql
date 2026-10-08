ALTER TABLE "import" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "import" ADD COLUMN "file_size" bigint;--> statement-breakpoint
CREATE INDEX "import_content_hash_size_idx" ON "import" USING btree ("content_hash","file_size");