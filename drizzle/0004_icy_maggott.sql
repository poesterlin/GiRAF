CREATE INDEX "album_session_idx" ON "album" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "image_session_recorded_idx" ON "image" USING btree ("session_id","recorded_at");--> statement-breakpoint
CREATE INDEX "media_image_idx" ON "media" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "media_album_idx" ON "media" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "snapshot_image_created_idx" ON "snapshot" USING btree ("image_id","created_at");