CREATE TABLE resources (
  code TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  added TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  trashed INTEGER NOT NULL DEFAULT 0 CHECK (trashed IN (0, 1))
);
