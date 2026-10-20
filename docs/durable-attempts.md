# Durable attempts

Every signing or infrastructure dispatch records an immutable request identity before effects. Claims serialize dispatch; a completed result is replayed only after current authorization is checked. A timeout preserves uncertainty and the original payload.

The UserOperation driver retains the signed operation, hash, submission anchor and receipt evidence. Recovery reconciles this exact identity. It never chooses another account path. See [Safe execution](user-operation-execution.md) and [storage](storage.md).
