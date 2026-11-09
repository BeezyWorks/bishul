-- Full-text search over public recipes: one FTS5 row per live public recipe. Unlike recipe_fts there are no triggers:
-- the text comes from the JSON snapshot, so the service (`syncPublic`) writes the row in the same batch as the
-- public_recipes row. Same tokenizer and prefix settings as recipe_fts so search behaves the same.
CREATE VIRTUAL TABLE public_recipe_fts USING fts5(
  public_id UNINDEXED,
  title,
  description,
  ingredients,
  tags,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
