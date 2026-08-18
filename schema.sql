-- PostgreSQL blueprint for a durable adapter.
-- The current runtime deliberately uses a dependency-free JSON store.
CREATE TABLE life_records (id UUID PRIMARY KEY, entity_type TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ);
CREATE INDEX life_records_type_idx ON life_records(entity_type);
CREATE INDEX life_records_data_idx ON life_records USING GIN(data);
CREATE TABLE history (id UUID PRIMARY KEY, entity_type TEXT NOT NULL, entity_id UUID, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX history_created_idx ON history(created_at DESC);
