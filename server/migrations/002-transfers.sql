BEGIN;
CREATE TABLE IF NOT EXISTS hrbip.transfers(id TEXT PRIMARY KEY,subject TEXT NOT NULL,path TEXT NOT NULL,bytes INTEGER NOT NULL,expires BIGINT NOT NULL,claimed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS hrbip.transfer_parts(transfer_id TEXT NOT NULL REFERENCES hrbip.transfers(id) ON DELETE CASCADE,part INTEGER NOT NULL,data BYTEA NOT NULL,PRIMARY KEY(transfer_id,part));
CREATE INDEX IF NOT EXISTS transfers_expiry ON hrbip.transfers(expires);
REVOKE ALL ON hrbip.transfers,hrbip.transfer_parts FROM PUBLIC;
ALTER TABLE hrbip.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrbip.transfer_parts ENABLE ROW LEVEL SECURITY;
COMMIT;
