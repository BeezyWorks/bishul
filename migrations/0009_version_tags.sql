CREATE TABLE `version_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version_id` text NOT NULL,
	`tag` text NOT NULL,
	`key` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `version_tags_version_idx` ON `version_tags` (`version_id`);--> statement-breakpoint
CREATE INDEX `version_tags_key_idx` ON `version_tags` (`key`);