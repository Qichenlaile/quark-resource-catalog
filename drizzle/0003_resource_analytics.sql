CREATE TABLE resource_daily_activity (
  day TEXT NOT NULL,
  code TEXT NOT NULL,
  visitor TEXT NOT NULL,
  views INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  PRIMARY KEY (day, code, visitor)
);
