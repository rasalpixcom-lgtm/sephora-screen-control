CREATE TABLE screen_remote_access (
  screen_id text PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  teamviewer_id text NOT NULL CHECK (teamviewer_id = '' OR teamviewer_id ~ '^[0-9]{1,32}$'),
  anydesk_id text NOT NULL CHECK (anydesk_id = '' OR anydesk_id ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$'),
  version text NOT NULL,
  updated_at timestamptz NOT NULL
);
