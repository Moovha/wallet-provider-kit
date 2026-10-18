import { Interface } from 'ethers';
export const tokenInterface = new Interface([
  'function approve(address spender,uint256 amount) returns(bool)',
  'function transfer(address recipient,uint256 amount) returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'function allowance(address owner,address spender) view returns(uint256)',
]);
export const swapInterface = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns(uint256 amountOut)',
]);
// Yearn4626Router-compatible entry point pulls assets and enforces minimum shares atomically.
export const vaultRouterInterface = new Interface([
  'function depositToVault(address vault,uint256 amount,address to,uint256 minSharesOut) payable returns(uint256 sharesOut)',
  'function approve(address token,address spender,uint256 amount) payable',
]);
export const vaultInterface = new Interface([
  'function asset() view returns(address)',
  'event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)',
]);
