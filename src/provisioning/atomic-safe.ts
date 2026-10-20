import { Interface, ZeroAddress } from 'ethers';
import { safeSetupInterface } from './safe.js';

/** SafeModuleSetup from @safe-global/safe-4337 0.3.0, canonical deployment; verify its runtime on each target network. */
export const safeModuleSetup = {
  address: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
  codeHash:
    '0xaf2d170bb766d2773c3fa88717f5b3599827478074d3767d1dee55e5c2f3fbcb',
} as const;
const setup = new Interface(['function enableModules(address[] modules)']);

/** One owner, one module, its fallback handler, and no initialization payment. */
export function atomicSafeInitializer(owner: string, module: string): string {
  return safeSetupInterface.encodeFunctionData('setup', [
    [owner],
    1,
    safeModuleSetup.address,
    setup.encodeFunctionData('enableModules', [[module]]),
    module,
    ZeroAddress,
    0,
    ZeroAddress,
  ]);
}
