// Pure SQLite projections keep indexes current for every writer, without process-local functions.
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const json = (path: string) =>
  `json_extract(NEW.record, ${quote('$.' + path)})`;
const strings = (path: string) =>
  `SELECT DISTINCT value FROM json_each(NEW.record, ${quote('$.' + path)}) WHERE type='text' AND json_type(NEW.record, ${quote('$.' + path)}) IN ('text','array')`;
const scalar = (expression: string) =>
  `SELECT ${expression} AS value WHERE typeof(${expression})='text' AND json_type(NEW.record) IN ('object','array')`;
const tuple = (...paths: string[]) =>
  scalar(`json_array(${paths.map(json).join(',')})`);
const owners = `${strings('owner')} UNION ${strings('linkedOwners')}`;
export const lookupDefinitions = [
  ['accounts', 'owner', strings('owner')],
  ['accounts', '$walletOwner', owners],
  [
    'accounts',
    '$walletPerson',
    `${owners} UNION SELECT CAST(key AS TEXT) AS value FROM json_each(NEW.record, '$.members') WHERE json_type(NEW.record, '$.members') IN ('object','array')`,
  ],
  ['grants', 'owner', strings('owner')],
  ['grants', 'accountId', strings('accountId')],
  ['grants', 'caller.clientId', strings('caller.clientId')],
  [
    'grants',
    '$caller',
    tuple('caller.issuer', 'caller.subject', 'caller.clientId'),
  ],
  ['requests', 'owner', strings('owner')],
  ['requests', 'accountId', strings('accountId')],
  [
    'requests',
    '$person',
    scalar(
      `coalesce(${json('userOwner')},${json('sharing.subjectOwner')},${json('owner')})`,
    ),
  ],
  [
    'requests',
    'input.user.identity.fields.identity_number',
    strings('input.user.identity.fields.identity_number'),
  ],
  [
    'attempts',
    '$resource',
    tuple('request.namespace', 'request.provider', 'request.resourceKey'),
  ],
  ['attempts', 'request.accountId', strings('request.accountId')],
  ['attempts', 'request.attemptId', strings('request.attemptId')],
  ['admissions', 'accountId', strings('accountId')],
  ['verifiedUsers', 'clientId', strings('clientId')],
  ['safeWalletAccounts', 'applicationId', strings('applicationId')],
  ['userOperationBatches', 'operationId', strings('operationId')],
  ['userOperationBatches', 'input.account_id', strings('input.account_id')],
  ['userOperationBatches', 'metadata.id', strings('metadata.id')],
  ['userOperationBatches', 'configurationHash', strings('configurationHash')],
  [
    'userOperationBatches',
    '$batchSender',
    scalar(`lower(${json('metadata.sender')})`),
  ],
  [
    'userOperationBatches',
    '$pendingBatch',
    scalar(
      `CASE WHEN ${json('stage')} IN ('included','complete','expired','failed') THEN 'no' ELSE 'yes' END`,
    ),
  ],
  [
    'supportedActions',
    '$actionNonce',
    scalar(
      `json_array(lower(${json('intent.account.address')}),${json('intent.nonce')})`,
    ),
  ],
  [
    'uniswapXOrders',
    '$orderNonce',
    scalar(
      `json_array(lower(${json('plan.review.swapper')}),${json('plan.review.nonce')})`,
    ),
  ],
] as const;
const insert = lookupDefinitions
  .map(
    ([
      collection,
      field,
      values,
    ]) => `INSERT INTO onboarding_lookup(collection,field,value,id)
SELECT NEW.collection,${quote(field)},value,NEW.id FROM (${values})
WHERE NEW.collection=${quote(collection)} OR NEW.collection GLOB ${quote('*:' + collection)};`,
  )
  .join('\n');
const clear = (ref: string) =>
  `DELETE FROM onboarding_lookup WHERE collection=${ref}.collection AND id=${ref}.id;`;
const retainCollection = `INSERT INTO onboarding_collections(collection) VALUES(NEW.collection) ON CONFLICT(collection) DO NOTHING;`;
const pruneCollection = `DELETE FROM onboarding_collections WHERE collection=OLD.collection AND NOT EXISTS(SELECT 1 FROM onboarding_records WHERE collection=OLD.collection);`;
export const lookupSchema = [
  `CREATE TABLE onboarding_collections (collection TEXT PRIMARY KEY NOT NULL) STRICT, WITHOUT ROWID`,
  `CREATE TABLE onboarding_lookup (
    collection TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, id TEXT NOT NULL,
    PRIMARY KEY(collection,field,value,id)
  ) STRICT, WITHOUT ROWID`,
  `CREATE INDEX onboarding_lookup_record ON onboarding_lookup(collection,id,field,value)`,
  `CREATE TABLE onboarding_lookup_counts (
    collection TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, count INTEGER NOT NULL CHECK(count>=0),
    PRIMARY KEY(collection,field,value)
  ) STRICT, WITHOUT ROWID`,
  `CREATE TRIGGER onboarding_lookup_insert AFTER INSERT ON onboarding_lookup BEGIN
    INSERT INTO onboarding_lookup_counts(collection,field,value,count) VALUES(NEW.collection,NEW.field,NEW.value,1)
    ON CONFLICT(collection,field,value) DO UPDATE SET count=count+1;
  END`,
  `CREATE TRIGGER onboarding_lookup_delete AFTER DELETE ON onboarding_lookup BEGIN
    UPDATE onboarding_lookup_counts SET count=count-1 WHERE collection=OLD.collection AND field=OLD.field AND value=OLD.value;
    DELETE FROM onboarding_lookup_counts WHERE collection=OLD.collection AND field=OLD.field AND value=OLD.value AND count=0;
  END`,
  `CREATE TRIGGER onboarding_records_insert AFTER INSERT ON onboarding_records BEGIN
    ${clear('NEW')}
    ${insert}
    ${retainCollection}
  END`,
  `CREATE TRIGGER onboarding_records_update AFTER UPDATE ON onboarding_records BEGIN
    ${clear('OLD')}
    ${clear('NEW')}
    ${insert}
    ${retainCollection}
    ${pruneCollection}
  END`,
  `CREATE TRIGGER onboarding_records_delete AFTER DELETE ON onboarding_records BEGIN
    ${clear('OLD')}
    ${pruneCollection}
  END`,
];
