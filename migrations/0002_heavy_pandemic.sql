CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collections_household_idx` ON `collections` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`accepted_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invites_token_uq` ON `household_invites` (`token`);--> statement-breakpoint
CREATE INDEX `household_invites_household_idx` ON `household_invites` (`household_id`);--> statement-breakpoint
CREATE TABLE `user_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`user_id` text NOT NULL,
	`system` text DEFAULT 'us' NOT NULL,
	`overrides` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_prefs_user_uq` ON `user_prefs` (`user_id`);--> statement-breakpoint
ALTER TABLE `meals` ADD `settled_at` integer;