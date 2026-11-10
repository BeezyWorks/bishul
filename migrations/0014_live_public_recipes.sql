-- Public recipes become live (no copy): the publication record keeps only who/how/ratings/saves, and the content
-- and search come from the private recipe and its trigger-maintained recipe_fts. Drops the copied columns and the
-- separate public_recipe_fts table. Generated for the column drops; the FTS drop is hand-written.
DROP TABLE IF EXISTS public_recipe_fts;
--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `author_name`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `snapshot`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `course`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `category`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `difficulty`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `cost`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `total_minutes`;--> statement-breakpoint
ALTER TABLE `public_recipes` DROP COLUMN `tag_keys`;
