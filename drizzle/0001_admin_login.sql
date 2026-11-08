CREATE TABLE admin_credentials (
  email TEXT PRIMARY KEY NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  credential_salt TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_login_attempts (
  client_key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
