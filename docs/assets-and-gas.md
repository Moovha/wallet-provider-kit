# Assets and gas

User assets reside at the user Safe address. Application sponsorship uses a retained funding account, verifying paymaster deposit and private bundler gas signer. These are distinct balances. The funding account is not a user account.

Read the application gas-funding endpoint before funding test infrastructure. Provision infrastructure through the provider operator API, then verify accepted chain, module, paymaster and fee limits. Sponsorship is bounded by durable reservations and current application authority. A paymaster deposit does not grant spending permission.

Keep private keys and funding credentials outside application clients. See [self-hosted sponsorship](self-hosted-sponsorship.md).
