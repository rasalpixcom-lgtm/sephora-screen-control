CREATE TABLE cms_updates (
  id text PRIMARY KEY,
  version text NOT NULL,
  payload jsonb NOT NULL,
  image bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CONSTRAINT cms_updates_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT cms_updates_image_check CHECK (image IS NULL OR octet_length(image) <= 5242880)
);
CREATE INDEX cms_updates_updated_idx ON cms_updates (updated_at DESC, id);
-- Finalized client reports are immutable snapshots, independent of inventory edits.
CREATE TABLE cms_reports (
  id text PRIMARY KEY,
  update_id text NOT NULL REFERENCES cms_updates(id),
  revision integer NOT NULL CONSTRAINT cms_reports_revision_check CHECK (revision > 0),
  source_version text NOT NULL,
  pdf bytea NOT NULL CONSTRAINT cms_reports_pdf_check CHECK (octet_length(pdf) <= 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE UNIQUE INDEX cms_reports_update_revision_idx ON cms_reports (update_id, revision);
CREATE UNIQUE INDEX cms_reports_update_version_idx ON cms_reports (update_id, source_version);
