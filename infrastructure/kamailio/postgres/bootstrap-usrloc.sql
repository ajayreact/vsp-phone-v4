-- Kamailio 5.8.7 PostgreSQL usrloc bootstrap (idempotent)
-- Source: utils/kamctl/postgres/{standard,usrloc}-create.sql @ kamailio/kamailio 5.8.7
-- Required for db_mode=2 usrloc/registrar (version table + location tables).

CREATE TABLE IF NOT EXISTS version (
    id SERIAL PRIMARY KEY NOT NULL,
    table_name VARCHAR(32) NOT NULL,
    table_version INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT version_table_name_idx UNIQUE (table_name)
);

INSERT INTO version (table_name, table_version) VALUES ('version', 1)
ON CONFLICT (table_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS location (
    id SERIAL PRIMARY KEY NOT NULL,
    ruid VARCHAR(64) DEFAULT '' NOT NULL,
    username VARCHAR(64) DEFAULT '' NOT NULL,
    domain VARCHAR(64) DEFAULT NULL,
    contact VARCHAR(512) DEFAULT '' NOT NULL,
    received VARCHAR(128) DEFAULT NULL,
    path VARCHAR(512) DEFAULT NULL,
    expires TIMESTAMP WITHOUT TIME ZONE DEFAULT '2030-05-28 21:32:15' NOT NULL,
    q REAL DEFAULT 1.0 NOT NULL,
    callid VARCHAR(255) DEFAULT 'Default-Call-ID' NOT NULL,
    cseq INTEGER DEFAULT 1 NOT NULL,
    last_modified TIMESTAMP WITHOUT TIME ZONE DEFAULT '2000-01-01 00:00:01' NOT NULL,
    flags INTEGER DEFAULT 0 NOT NULL,
    cflags INTEGER DEFAULT 0 NOT NULL,
    user_agent VARCHAR(255) DEFAULT '' NOT NULL,
    socket VARCHAR(64) DEFAULT NULL,
    methods INTEGER DEFAULT NULL,
    instance VARCHAR(255) DEFAULT NULL,
    reg_id INTEGER DEFAULT 0 NOT NULL,
    server_id INTEGER DEFAULT 0 NOT NULL,
    connection_id INTEGER DEFAULT 0 NOT NULL,
    keepalive INTEGER DEFAULT 0 NOT NULL,
    partition INTEGER DEFAULT 0 NOT NULL
);

-- Upgrade legacy v4 usrloc-schema.sql deployments without dropping data.
ALTER TABLE location ADD COLUMN IF NOT EXISTS reg_id INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE location ADD COLUMN IF NOT EXISTS server_id INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE location ADD COLUMN IF NOT EXISTS connection_id INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE location ADD COLUMN IF NOT EXISTS keepalive INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE location ADD COLUMN IF NOT EXISTS partition INTEGER DEFAULT 0 NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'location_ruid_idx'
    ) THEN
        ALTER TABLE location ADD CONSTRAINT location_ruid_idx UNIQUE (ruid);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS location_account_contact_idx ON location (username, domain, contact);
CREATE INDEX IF NOT EXISTS location_expires_idx ON location (expires);
CREATE INDEX IF NOT EXISTS location_tcpcon_idx ON location (connection_id);
CREATE INDEX IF NOT EXISTS location_connection_idx ON location (server_id, connection_id);

INSERT INTO version (table_name, table_version) VALUES ('location', 9)
ON CONFLICT (table_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS location_attrs (
    id SERIAL PRIMARY KEY NOT NULL,
    ruid VARCHAR(64) DEFAULT '' NOT NULL,
    username VARCHAR(64) DEFAULT '' NOT NULL,
    domain VARCHAR(64) DEFAULT NULL,
    aname VARCHAR(64) DEFAULT '' NOT NULL,
    atype INTEGER DEFAULT 0 NOT NULL,
    avalue VARCHAR(512) DEFAULT '' NOT NULL,
    last_modified TIMESTAMP WITHOUT TIME ZONE DEFAULT '2000-01-01 00:00:01' NOT NULL
);

CREATE INDEX IF NOT EXISTS location_attrs_account_record_idx ON location_attrs (username, domain, ruid);
CREATE INDEX IF NOT EXISTS location_attrs_last_modified_idx ON location_attrs (last_modified);
CREATE INDEX IF NOT EXISTS location_attrs_account_idx ON location_attrs (username, domain, aname);

INSERT INTO version (table_name, table_version) VALUES ('location_attrs', 1)
ON CONFLICT (table_name) DO NOTHING;
