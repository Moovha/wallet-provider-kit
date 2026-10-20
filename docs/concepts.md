# Roles and terms

The **owner** is the user whose identity and consent authorize access. An **application** authenticates with its own token and acts under a current owner grant. The **provider** evaluates policy and operates durable signing and execution.

A **Safe** is the user’s on-chain account and deposit address. Its private owner signer is stored in OWS. A **UserOperation** contains the exact permitted calls, nonce, gas bounds, sponsorship and Safe signature. The **bundler** submits it to EntryPoint v0.7. The **paymaster** sponsors its bounded gas cost.

A **batch** is a durable application request. Acknowledgement means the provider retained it, not that the chain executed it. Verified inclusion and finality are reported separately.
