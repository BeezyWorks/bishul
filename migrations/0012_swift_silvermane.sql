CREATE TABLE `public_recipe_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`public_recipe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stars` integer NOT NULL,
	FOREIGN KEY (`public_recipe_id`) REFERENCES `public_recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_recipe_ratings_uq` ON `public_recipe_ratings` (`public_recipe_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `public_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`recipe_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`anonymous` integer DEFAULT false NOT NULL,
	`author_name` text,
	`title` text NOT NULL,
	`snapshot` text NOT NULL,
	`course` text,
	`category` text,
	`difficulty` text,
	`cost` integer,
	`total_minutes` integer,
	`tag_keys` text DEFAULT '|' NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`save_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_recipes_recipe_uq` ON `public_recipes` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `public_recipes_owner_idx` ON `public_recipes` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `public_recipes_published_idx` ON `public_recipes` (`published_at`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `source_public_recipe_id` text;--> statement-breakpoint
CREATE INDEX `recipes_source_public_idx` ON `recipes` (`source_public_recipe_id`);