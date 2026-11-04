-- Full-text search over recipes: one FTS5 row per live version, holding the recipe title + version title, the
-- description, and the ingredient text (as written, plus catalog names and aliases such as "Shabbos"/"kitniyos").
-- Hand-written; kept in sync by the triggers below. Query with: SELECT version_id FROM recipe_fts WHERE recipe_fts MATCH ?
CREATE VIRTUAL TABLE recipe_fts USING fts5(
  version_id UNINDEXED,
  recipe_id UNINDEXED,
  title,
  description,
  ingredients,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
-- Backfill any rows that already exist.
INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND 1 = 1;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_versions_ai AFTER INSERT ON versions
BEGIN
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_versions_au AFTER UPDATE ON versions
BEGIN
  DELETE FROM recipe_fts WHERE version_id = NEW.id;
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_versions_ad AFTER DELETE ON versions
BEGIN
  DELETE FROM recipe_fts WHERE version_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_lines_ai AFTER INSERT ON ingredient_lines
BEGIN
  DELETE FROM recipe_fts WHERE version_id = NEW.version_id;
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id = NEW.version_id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_lines_au AFTER UPDATE ON ingredient_lines
BEGIN
  DELETE FROM recipe_fts WHERE version_id IN (OLD.version_id, NEW.version_id);
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id IN (OLD.version_id, NEW.version_id);
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_lines_ad AFTER DELETE ON ingredient_lines
BEGIN
  DELETE FROM recipe_fts WHERE version_id = OLD.version_id;
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id = OLD.version_id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_recipes_au AFTER UPDATE ON recipes WHEN OLD.title IS NOT NEW.title OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  DELETE FROM recipe_fts WHERE recipe_id = NEW.id;
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.recipe_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_recipes_ad AFTER DELETE ON recipes
BEGIN
  DELETE FROM recipe_fts WHERE recipe_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER recipe_fts_ingredients_au AFTER UPDATE ON ingredients WHEN OLD.name IS NOT NEW.name OR OLD.aliases IS NOT NEW.aliases
BEGIN
  DELETE FROM recipe_fts WHERE version_id IN (SELECT version_id FROM ingredient_lines WHERE ingredient_id = NEW.id);
  INSERT INTO recipe_fts (version_id, recipe_id, title, description, ingredients)
  SELECT v.id, v.recipe_id, r.title || ' ' || v.title, coalesce(v.description, ''),
    coalesce((SELECT group_concat(il.original_text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.aliases, ''), ' ')
      FROM ingredient_lines il LEFT JOIN ingredients i ON i.id = il.ingredient_id
      WHERE il.version_id = v.id AND il.deleted_at IS NULL), '')
  FROM versions v JOIN recipes r ON r.id = v.recipe_id
  WHERE v.deleted_at IS NULL AND r.deleted_at IS NULL AND v.id IN (SELECT version_id FROM ingredient_lines WHERE ingredient_id = NEW.id);
END;
