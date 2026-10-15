/** Versioned, toolkit-owned schema. Never applied to another application's database. */
export const schemaVersion = 1;
export const applicationId = 0x57504b54;
export const schema = `
CREATE TABLE onboarding_records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record)),
  PRIMARY KEY(collection, id)
) STRICT;
CREATE TABLE onboarding_audit (
  sequence INTEGER PRIMARY KEY,
  record TEXT NOT NULL CHECK(json_valid(record))
) STRICT;
CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  maximum TEXT NOT NULL,
  reserved TEXT NOT NULL DEFAULT '0'
) STRICT;
CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('sign_typed_data','relay_transaction')),
  fingerprint TEXT NOT NULL,
  record TEXT NOT NULL CHECK(json_valid(record)),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
) STRICT;
CREATE INDEX approvals_account ON approvals(account_id);
CREATE TABLE admissions (
  namespace TEXT NOT NULL,
  provider TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request TEXT NOT NULL CHECK(json_valid(request)),
  approval_id TEXT REFERENCES approvals(id),
  context TEXT CHECK(context IS NULL OR json_valid(context)),
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  units TEXT NOT NULL,
  PRIMARY KEY(namespace, provider, attempt_id),
  UNIQUE(namespace, provider, resource_key)
) STRICT;
CREATE TABLE idempotency (
  namespace TEXT NOT NULL,
  provider TEXT NOT NULL,
  caller_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  approval_id TEXT NOT NULL REFERENCES approvals(id),
  attempt_id TEXT NOT NULL,
  PRIMARY KEY(namespace, provider, caller_key, idempotency_key),
  FOREIGN KEY(namespace, provider, attempt_id) REFERENCES admissions(namespace, provider, attempt_id)
) STRICT;
CREATE TABLE attempts (
  namespace TEXT NOT NULL,
  provider TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('dispatch','succeeded','failed','unknown')),
  lease_token TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  result TEXT CHECK(result IS NULL OR json_valid(result)),
  failure TEXT CHECK(failure IS NULL OR json_valid(failure)),
  PRIMARY KEY(namespace, provider, attempt_id),
  FOREIGN KEY(namespace, provider, attempt_id) REFERENCES admissions(namespace, provider, attempt_id),
  CHECK((state = 'succeeded' AND result IS NOT NULL AND failure IS NULL) OR (state != 'succeeded' AND result IS NULL))
) STRICT;
CREATE INDEX attempts_state ON attempts(state, lease_expires_at);
CREATE TABLE financial_audit (
  sequence INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  event TEXT NOT NULL,
  reference TEXT NOT NULL
) STRICT;
CREATE TABLE enrollments (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL UNIQUE,
  record TEXT NOT NULL CHECK(json_valid(record)),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
) STRICT;
CREATE TABLE enrollment_keys (
  caller_key TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('begin','submit')),
  idempotency_key TEXT NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  fingerprint TEXT NOT NULL,
  PRIMARY KEY(caller_key, purpose, idempotency_key)
) STRICT;
CREATE TABLE enrollment_owners (
  identity_key TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL UNIQUE REFERENCES enrollments(account_id),
  owner_subject TEXT NOT NULL
) STRICT;
`;
