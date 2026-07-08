-- Kamailio usrloc persistence schema (Remediation H-06)
-- Apply outside Prisma migrations: psql $DATABASE_URL -f usrloc-schema.sql
-- Standard Kamailio location table for db_mode=2

CREATE TABLE IF NOT EXISTS location (
    id SERIAL PRIMARY KEY NOT NULL,
    ruid VARCHAR(64) DEFAULT '' NOT NULL,
    username VARCHAR(64) DEFAULT '' NOT NULL,
    domain VARCHAR(64) DEFAULT '' NOT NULL,
    contact TEXT NOT NULL,
    received VARCHAR(128) DEFAULT NULL,
    path TEXT DEFAULT NULL,
    expires TIMESTAMP WITHOUT TIME ZONE DEFAULT '2030-05-28 21:32:15' NOT NULL,
    q REAL DEFAULT 1.0 NOT NULL,
    callid VARCHAR(255) DEFAULT 'Default-Call-ID' NOT NULL,
    cseq INT DEFAULT 1 NOT NULL,
    last_modified TIMESTAMP WITHOUT TIME ZONE DEFAULT '1900-01-01 00:00:01' NOT NULL,
    flags INT DEFAULT 0 NOT NULL,
    cflags INT DEFAULT 0 NOT NULL,
    user_agent VARCHAR(255) DEFAULT '' NOT NULL,
    socket VARCHAR(64) DEFAULT NULL,
    methods INT DEFAULT NULL,
    sip_instance VARCHAR(255) DEFAULT NULL,
    kv VARCHAR(255) DEFAULT NULL,
    attr VARCHAR(255) DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS location_account_contact_idx ON location (username, domain, contact);
CREATE INDEX IF NOT EXISTS location_expires_idx ON location (expires);

CREATE TABLE IF NOT EXISTS location_attrs (
    id SERIAL PRIMARY KEY NOT NULL,
    ruid VARCHAR(64) DEFAULT '' NOT NULL,
    username VARCHAR(64) DEFAULT '' NOT NULL,
    domain VARCHAR(64) DEFAULT '' NOT NULL,
    aname VARCHAR(64) DEFAULT '' NOT NULL,
    atype INT DEFAULT 0 NOT NULL,
    avalue VARCHAR(512) DEFAULT '' NOT NULL,
    last_modified TIMESTAMP WITHOUT TIME ZONE DEFAULT '1900-01-01 00:00:01' NOT NULL
);

CREATE INDEX IF NOT EXISTS location_attrs_account_idx ON location_attrs (username, domain, aname);
