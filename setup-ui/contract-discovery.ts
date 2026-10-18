import {
  Fragment,
  FunctionFragment,
  ZeroAddress,
  getAddress,
  keccak256,
} from 'ethers';

export const maximumAbiBytes = 512 * 1024;
export interface DiscoveredMethod {
  signature: string;
  selector: string;
  mutability: string;
}
export interface DiscoveredContract {
  code_hash: string;
  implementation?: { address: string; code_hash: string };
  methods: DiscoveredMethod[];
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function methodsFromAbi(value: unknown): DiscoveredMethod[] {
  const abi = record(value) ? value.abi : value;
  if (!Array.isArray(abi) || !abi.length || abi.length > 2048)
    throw new Error(
      'Supply an ABI array or a compiler artifact containing an ABI array (up to 2,048 entries).',
    );
  const methods = new Map<string, DiscoveredMethod>();
  const selectors = new Map<string, string>();
  for (const entry of abi) {
    let fragment: Fragment;
    try {
      fragment = Fragment.from(entry);
    } catch {
      throw new Error(
        'The ABI contains an invalid entry. Check the exported ABI or compiler artifact.',
      );
    }
    if (!FunctionFragment.isFragment(fragment)) continue;
    const signature = fragment.format('sighash');
    if (signature.length > 256)
      throw new Error('An ABI method exceeds the supported signature length.');
    const previous = selectors.get(fragment.selector);
    if (previous && previous !== signature)
      throw new Error(
        'Two ABI methods share a selector. Resolve the collision before registering this contract.',
      );
    const method = {
      signature,
      selector: fragment.selector,
      mutability: fragment.stateMutability,
    };
    if (
      methods.has(signature) &&
      methods.get(signature)!.mutability !== method.mutability
    )
      throw new Error(
        'The ABI contains conflicting declarations for a method.',
      );
    methods.set(signature, method);
    selectors.set(fragment.selector, signature);
  }
  if (!methods.size)
    throw new Error(
      'This ABI contains no named functions. Constructors, events and fallback/receive handlers cannot be registered as methods.',
    );
  if (methods.size > 512)
    throw new Error('This ABI exceeds the 512-method discovery limit.');
  return [...methods.values()].sort((a, b) =>
    a.signature.localeCompare(b.signature),
  );
}
export function parseAbi(text: string): DiscoveredMethod[] {
  if (new TextEncoder().encode(text).length > maximumAbiBytes)
    throw new Error('The ABI or artifact must be no larger than 512 KiB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Enter valid ABI JSON or upload a JSON compiler artifact.');
  }
  return methodsFromAbi(value);
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error('Enter a deployed contract address on Base Sepolia.');
  let result: string;
  try {
    result = getAddress(value);
  } catch {
    throw new Error('Check the contract address checksum.');
  }
  if (result === ZeroAddress)
    throw new Error('Enter a nonzero deployed contract address.');
  return result;
}
async function responseJson(response: Response): Promise<unknown> {
  if (
    !response.body ||
    Number(response.headers.get('content-length') ?? '0') > maximumAbiBytes
  )
    throw new Error(
      'The verification response exceeds the 512 KiB limit. Use an ABI export instead.',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximumAbiBytes)
        throw new Error(
          'The verification response exceeds the 512 KiB limit. Use an ABI export instead.',
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(
      'The verification service returned invalid metadata. Use an ABI export instead.',
    );
  }
}
async function metadata(
  target: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const response = await fetcher(
    `https://sourcify.dev/server/v2/contract/84532/${target}?fields=abi,runtimeBytecode.onchainBytecode,proxyResolution`,
    {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal,
    },
  );
  if (response.status === 404)
    throw new Error(
      'No Sourcify verification was found on Base Sepolia. Upload or paste the ABI and supply the bytecode pins manually.',
    );
  if (!response.ok)
    throw new Error(
      'Verified contract lookup is unavailable. Retry later or upload/paste the ABI.',
    );
  const value = await responseJson(response);
  if (
    !record(value) ||
    value.chainId !== '84532' ||
    address(value.address) !== target ||
    !['exact_match', 'match'].includes(String(value.runtimeMatch)) ||
    !record(value.runtimeBytecode) ||
    typeof value.runtimeBytecode.onchainBytecode !== 'string' ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(value.runtimeBytecode.onchainBytecode) ||
    !record(value.proxyResolution) ||
    typeof value.proxyResolution.isProxy !== 'boolean' ||
    value.proxyResolution.error != null
  )
    throw new Error(
      'The verification response has incomplete or mismatched deployment metadata. Use a reviewed ABI and bytecode pins.',
    );
  return {
    abi: value.abi,
    code_hash: keccak256(value.runtimeBytecode.onchainBytecode),
    proxy: value.proxyResolution,
  };
}
/** Public metadata suggestions only. No wallet credential or provider authorization is sent. */
export async function discoverContract(
  input: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DiscoveredContract> {
  const target = address(input);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 12000);
  try {
    const contract = await metadata(target, fetcher, controller.signal);
    if (!contract.proxy.isProxy)
      return {
        code_hash: contract.code_hash,
        methods: methodsFromAbi(contract.abi),
      };
    const implementations = contract.proxy.implementations;
    if (
      contract.proxy.proxyType !== 'EIP1967Proxy' ||
      !Array.isArray(implementations) ||
      implementations.length !== 1 ||
      !record(implementations[0])
    )
      throw new Error(
        'Automatic import supports a single EIP-1967 implementation. Other proxy layouts require a reviewed execution mechanism.',
      );
    const implementationAddress = address(implementations[0].address);
    if (implementationAddress === target)
      throw new Error('Proxy metadata points back to the same contract.');
    const implementation = await metadata(
      implementationAddress,
      fetcher,
      controller.signal,
    );
    if (implementation.proxy.isProxy)
      throw new Error(
        'Nested proxies are not supported by automatic registration.',
      );
    const abi = [
      ...(Array.isArray(contract.abi) ? contract.abi : []),
      ...(Array.isArray(implementation.abi) ? implementation.abi : []),
    ];
    if (!Array.isArray(implementation.abi))
      throw new Error(
        'No verified implementation ABI was found. Upload the reviewed implementation ABI instead.',
      );
    return {
      code_hash: contract.code_hash,
      implementation: {
        address: implementationAddress,
        code_hash: implementation.code_hash,
      },
      methods: methodsFromAbi(abi),
    };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        'Verified contract lookup timed out. Retry or upload/paste the ABI.',
      );
    if (error instanceof TypeError)
      throw new Error(
        'Cannot reach the verification service. Check connectivity or upload/paste the ABI.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
