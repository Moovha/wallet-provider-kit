import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function patchBundlerScheduling(source, expectedHash) {
  if (createHash('sha256').update(source).digest('hex') !== expectedHash)
    throw Error('Bundler scheduler source mismatch');
  const needle = 'this.sendBundleToExecutor(bundle)';
  if (source.split(needle).length !== 2)
    throw Error('Unexpected bundler scheduler layout');
  return source.replace(needle, 'await ' + needle);
}

/** Retain the pinned trusted-pool checks while enforcing the shared paymaster's cumulative prefund. */
export function patchBundlerFunding(source, expectedHash) {
  if (createHash('sha256').update(source).digest('hex') !== expectedHash)
    throw Error('Bundler funding source mismatch');
  const start = source.indexOf('async shouldSkip(');
  const branch = source.indexOf('if (!this.config.safeMode)', start);
  const position = source.indexOf('skip: false', branch);
  if (start < 0 || branch < 0 || position < 0 || position - branch > 150)
    throw Error('Unexpected bundler funding layout');
  const replacement = `skip: privateOperationExpired(userOp) || !(await reservePaymasterPrefund({
    scope: this.config.publicClient,
    entryPoint,
    userOp,
    balances: paymasterDeposit,
    readBalance: (paymaster) => this.config.publicClient.readContract({
      address: entryPoint,
      abi: EntryPointV07Abi,
      functionName: "balanceOf",
      args: [paymaster],
    }),
  })), removeOutstanding: privateOperationExpired(userOp)`;
  return (
    `import { reservePaymasterPrefund, privateOperationExpired } from "/app/wpk-bundler-funding.mjs";\n` +
    source.slice(0, position) +
    replacement +
    source.slice(position + 'skip: false'.length)
  );
}

/** Select a funded batch only after the preceding bundle has released its executor. */
export function patchBundlerFundingLease(source, expectedHash) {
  if (createHash('sha256').update(source).digest('hex') !== expectedHash)
    throw Error('Bundler funding lease source mismatch');
  const selection =
    /const bundles = await this\.mempool\.getBundles\(\s*this\.config\.maxBundleCount\s*\);?/;
  if (
    !selection.test(source) ||
    source.split('const rpm = this.opsCount.length').length !== 2
  )
    throw Error('Unexpected bundler funding lease layout');
  let patched = source
    .replace(
      selection,
      `
    if (this.config.maxBundleCount !== 1) throw Error("Private bundler requires one bundle per executor lease");
    if (!this.redisBlockCache) throw Error("Private bundler requires a shared queue");
    let queued = 0;
    try {
    for (const entryPoint of this.config.entrypoints) {
      const count = await this.redisBlockCache.redis.zcard(this.config.redisKeyPrefix + ":" + this.config.chainId + ":" + entryPoint + ":outstanding:ready-queue");
      if (!Number.isSafeInteger(count) || count < 0) throw Error("Invalid private queue count");
      queued += count;
    }
    } catch { queued = 0; }
    if (queued > 0) {
    const wallet = await this.senderManager.getWallet();
    let assigned = false;
    try {
      const bundles = await this.mempool.getBundles(1);
      if (bundles.length > 1) throw Error("Private bundler exceeded its executor lease");
  `,
    )
    .replace(
      'await this.sendBundleToExecutor(bundle)',
      'assigned = true; await this.sendBundleToExecutor(bundle, wallet)',
    )
    .replace(
      'const rpm = this.opsCount.length',
      `} finally { if (!assigned) await this.senderManager.markWalletProcessed(wallet); }\n}\nconst rpm = this.opsCount.length`,
    );
  if (patched.includes('async sendBundleToExecutor(userOpBundle)'))
    patched = patched.replace(
      'async sendBundleToExecutor(userOpBundle)',
      'async sendBundleToExecutor(userOpBundle, executor)',
    );
  else if (patched.includes('userOpBundle: UserOperationBundle\n'))
    patched = patched.replace(
      'userOpBundle: UserOperationBundle\n',
      'userOpBundle: UserOperationBundle,\nexecutor?: Awaited<ReturnType<SenderManager["getWallet"]>>\n',
    );
  else throw Error('Unexpected executor parameter layout');
  const start = patched.indexOf('async sendBundleToExecutor(');
  const body = patched
    .slice(start)
    .replace(
      'const wallet = await this.senderManager.getWallet()',
      'const wallet = executor ?? (await this.senderManager.getWallet())',
    );
  // TypeScript and emitted JavaScript retain different indentation.
  const reads =
    /this\.gasPriceManager\.tryGetNetworkGasPrice\(\{\s*forExecutor: true\s*\}\),\s*this\.getBaseFee\(\),\s*this\.config\.publicClient\.getTransactionCount\(\{\s*address: wallet\.address,\s*blockTag: "latest"\s*\}\)/;
  if (!reads.test(body)) throw Error('Unexpected bundle parameter layout');
  const bounded = body.replace(
    reads,
    `readBundleParameter(() => this.gasPriceManager.tryGetNetworkGasPrice({ forExecutor: true })),
    readBundleParameter(() => this.getBaseFee()),
    readBundleParameter(() => this.config.publicClient.getTransactionCount({ address: wallet.address, blockTag: "latest" }))`,
  );
  return (
    `import { readBundleParameter } from "/app/wpk-bundler-funding.mjs";\n` +
    patched.slice(0, start) +
    bounded
  );
}

/** Register an acquired executor immediately; delay only when no executor is available. */
export function patchBundlerSenderAcquisition(source, expectedHash) {
  if (createHash('sha256').update(source).digest('hex') !== expectedHash)
    throw Error('Bundler sender source mismatch');
  const acquisition =
    /walletAddress = await walletPool\.pop\(\);?\s*await delay\(100\);?/;
  if (!acquisition.test(source))
    throw Error('Unexpected bundler sender layout');
  return source.replace(
    acquisition,
    'walletAddress = await walletPool.pop();\nif (!walletAddress) await delay(100);',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [path, hash, leaseHash] of [
    [
      '/app/src/executor/executorManager.ts',
      '844f0ee38b42dbc42c7e8700b2b74093a0c89cc0a487bd2db3d97f1df901e88c',
      'f3e71cc40834eade712d7d1740eabb12b1223eb8cc0d00cb65e858c2fcd7e8f9',
    ],
    [
      '/app/src/esm/executor/executorManager.js',
      'e10751e61fbed810445999e746dd7200e2c667b6e1f7694eb3e9a4aeceda652d',
      'b5455de24153974138244033804dd1e5e533d91fc277ee643e812a12c91ce0f4',
    ],
  ]) {
    await writeFile(
      path,
      patchBundlerFundingLease(
        patchBundlerScheduling(await readFile(path, 'utf8'), hash),
        leaseHash,
      ),
    );
  }
  for (const [path, hash] of [
    [
      '/app/src/mempool/mempool.ts',
      '3bc6ad276346bec8325c409e254d3bc56816baaab6bdb287c35c94aef55c9e73',
    ],
    [
      '/app/src/esm/mempool/mempool.js',
      '5a4e05d3928b565c81962a2dae16d58754f0aeee1fe097eebf745199bd2a1efc',
    ],
  ]) {
    await writeFile(
      path,
      patchBundlerFunding(await readFile(path, 'utf8'), hash),
    );
  }
  for (const [path, hash] of [
    [
      '/app/src/executor/senderManager/createRedisSenderManager.ts',
      '4cbbf29cfef3e3958cb8ad17ce076f03755c8c9e264a088d1a5d940b8d092c0f',
    ],
    [
      '/app/src/esm/executor/senderManager/createRedisSenderManager.js',
      '1f64576e3b1b669a512c10d2198ca93aca077cb804d5a434b482200d5375988d',
    ],
  ]) {
    await writeFile(
      path,
      patchBundlerSenderAcquisition(await readFile(path, 'utf8'), hash),
    );
  }
}
