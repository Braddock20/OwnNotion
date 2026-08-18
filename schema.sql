-- Auto-applied by the server on first boot when DATABASE_URL is set.
-- Kept here for reference / manual provisioning.
CREATE TABLE IF NOT EXISTS life_records (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS life_records_type_idx ON life_records(entity_type);

CREATE TABLE IF NOT EXISTS life_history (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS life_history_created_idx ON life_history(created_at DESC);
