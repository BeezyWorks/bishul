CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`user_id` text NOT NULL,
	`hashed_key` text NOT NULL,
	`prefix` text NOT NULL,
	`scope` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_uq` ON `api_keys` (`hashed_key`);--> statement-breakpoint
CREATE INDEX `api_keys_user_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `constraints` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`person_id` text NOT NULL,
	`tag_type` text NOT NULL,
	`tag` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`active_when` text NOT NULL,
	`note` text,
	`source` text NOT NULL,
	`layer_household_id` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layer_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `constraints_person_idx` ON `constraints` (`person_id`);--> statement-breakpoint
CREATE INDEX `constraints_layer_idx` ON `constraints` (`layer_household_id`);--> statement-breakpoint
CREATE TABLE `dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dimensions_household_idx` ON `dimensions` (`household_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`item` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`designation` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `equipment_household_idx` ON `equipment` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_household_user_uq` ON `household_members` (`household_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `household_members_user_idx` ON `household_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`is_ghost` integer DEFAULT false NOT NULL,
	`ghost_of_household_id` text,
	FOREIGN KEY (`ghost_of_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `households_owner_idx` ON `households` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `households_ghost_of_idx` ON `households` (`ghost_of_household_id`);--> statement-breakpoint
CREATE TABLE `ingredient_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version_id` text NOT NULL,
	`position` integer NOT NULL,
	`quantity_metric` real,
	`unit_metric` text,
	`original_text` text NOT NULL,
	`ingredient_id` text,
	`prep_note` text,
	`skip_impact` text DEFAULT 'ruins' NOT NULL,
	`substitutions` text,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingredient_lines_version_idx` ON `ingredient_lines` (`version_id`,`position`);--> statement-breakpoint
CREATE INDEX `ingredient_lines_ingredient_idx` ON `ingredient_lines` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text,
	`name` text NOT NULL,
	`aliases` text,
	`category` text NOT NULL,
	`allergens` text,
	`flags` text,
	`density_g_per_ml` real,
	`grams_per_piece` real,
	`sources` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingredients_household_idx` ON `ingredients` (`household_id`);--> statement-breakpoint
CREATE INDEX `ingredients_name_idx` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `meal_attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`meal_id` text NOT NULL,
	`person_id` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_attendees_uq` ON `meal_attendees` (`meal_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `meal_attendees_person_idx` ON `meal_attendees` (`person_id`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`meal_id` text NOT NULL,
	`position` integer NOT NULL,
	`course` text,
	`version_id` text,
	`scale` real,
	`servings` integer,
	`brought_by` text,
	`description` text,
	`kashrut` text,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_idx` ON `meal_items` (`meal_id`,`position`);--> statement-breakpoint
CREATE INDEX `meal_items_version_idx` ON `meal_items` (`version_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`time` integer,
	`kind` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meals_household_date_idx` ON `meals` (`household_id`,`date`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_household_id` text NOT NULL,
	`about_person_id` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`author_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`about_person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_person_idx` ON `notes` (`about_person_id`,`author_household_id`);--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity_metric` real,
	`unit` text,
	`location` text,
	`expires_on` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pantry_household_idx` ON `pantry_items` (`household_id`);--> statement-breakpoint
CREATE INDEX `pantry_ingredient_idx` ON `pantry_items` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `person_links` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`ghost_person_id` text NOT NULL,
	`real_person_id` text NOT NULL,
	`mode` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`ghost_person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`real_person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_links_ghost_uq` ON `person_links` (`ghost_person_id`);--> statement-breakpoint
CREATE INDEX `person_links_real_idx` ON `person_links` (`real_person_id`);--> statement-breakpoint
CREATE TABLE `person_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`person_id` text NOT NULL,
	`rule` text NOT NULL,
	`layer_household_id` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layer_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `person_rules_person_idx` ON `person_rules` (`person_id`);--> statement-breakpoint
CREATE TABLE `persons` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`is_child` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `persons_household_idx` ON `persons` (`household_id`);--> statement-breakpoint
CREATE INDEX `persons_user_idx` ON `persons` (`user_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`person_id` text NOT NULL,
	`version_id` text NOT NULL,
	`reaction` text NOT NULL,
	`note` text,
	`recorded_by_user_id` text NOT NULL,
	`layer_household_id` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layer_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reactions_person_idx` ON `reactions` (`person_id`);--> statement-breakpoint
CREATE INDEX `reactions_version_idx` ON `reactions` (`version_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`recipe_id` text NOT NULL,
	`parent_version_id` text,
	`lineage_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source_links` text,
	`servings` integer,
	`course` text,
	`form` text,
	`category` text,
	`difficulty` text,
	`active_minutes` integer,
	`total_minutes` integer,
	`serving_style` text,
	`holds_on_blech` integer,
	`easy_to_deliver` integer,
	`cost` integer,
	`nutrition` text,
	`pre_prep` text,
	`steps` text,
	`flags` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_recipe_idx` ON `versions` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `versions_lineage_idx` ON `versions` (`lineage_id`);--> statement-breakpoint
CREATE INDEX `versions_hash_idx` ON `versions` (`content_hash`);--> statement-breakpoint
CREATE INDEX `versions_parent_idx` ON `versions` (`parent_version_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`owner_user_id` text NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recipes_household_idx` ON `recipes` (`household_id`);--> statement-breakpoint
CREATE INDEX `recipes_owner_idx` ON `recipes` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `served_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`person_id` text NOT NULL,
	`version_id` text NOT NULL,
	`meal_id` text NOT NULL,
	`served_on` text NOT NULL,
	`layer_household_id` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layer_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `served_log_person_idx` ON `served_log` (`person_id`,`served_on`);--> statement-breakpoint
CREATE INDEX `served_log_version_idx` ON `served_log` (`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `served_log_uq` ON `served_log` (`meal_id`,`version_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`token` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_by` text NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_uq` ON `share_links` (`token`);--> statement-breakpoint
CREATE INDEX `share_links_creator_idx` ON `share_links` (`created_by`);--> statement-breakpoint
CREATE INDEX `share_links_target_idx` ON `share_links` (`kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `shopping_list` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`household_id` text NOT NULL,
	`ingredient_id` text,
	`position` integer NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`note` text,
	`manual` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shopping_household_idx` ON `shopping_list` (`household_id`,`position`);--> statement-breakpoint
CREATE INDEX `shopping_ingredient_idx` ON `shopping_list` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `version_dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`fit` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_id`) REFERENCES `dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `version_dimensions_uq` ON `version_dimensions` (`version_id`,`dimension_id`);--> statement-breakpoint
CREATE INDEX `version_dimensions_dim_idx` ON `version_dimensions` (`dimension_id`);--> statement-breakpoint
CREATE TABLE `version_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`user_id` text NOT NULL,
	`via` text NOT NULL,
	`summary` text,
	`diff` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `version_edits_version_idx` ON `version_edits` (`version_id`,`at`);--> statement-breakpoint
CREATE TABLE `version_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version_id` text NOT NULL,
	`item` text NOT NULL,
	`designation` text,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `version_equipment_version_idx` ON `version_equipment` (`version_id`);