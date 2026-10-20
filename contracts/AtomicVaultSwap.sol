// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {IDexAdapter} from "./DexAdapters.sol";
import {Math} from "./vendor/Math.sol";

interface IVaultSwapToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IVaultSwapVault is IVaultSwapToken {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
}

interface IVaultSwapPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IVaultSwapRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IVaultSwapV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256);
}

/// @notice Exact-input DEX routes with optional ERC-4626 wrappers and proportional quote protection.
contract AtomicVaultSwap {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    struct Quote {
        uint256 assetsIn;
        uint256 assetsOut;
        uint256 amountOut;
        uint48 quotedAt;
        uint48 deadline;
        uint16 slippageBps;
    }

    struct Request {
        address tokenIn;
        address tokenOut;
        address sourceVault;
        address destinationVault;
        uint256 amount;
        uint8 protocol;
        bytes path;
        Quote quote;
    }

    struct DexStep {
        address adapter;
        address tokenOut;
        bytes data;
    }
    address public immutable adapterAdministrator;
    mapping(address => bytes32) public approvedAdapters;
    event AdapterApprovalChanged(address indexed adapter, bytes32 codeHash);
    error AdapterNotApproved();
    error Unauthorized();
    address public immutable v3Router;
    address public immutable v4Router;
    address public immutable permit2;
    uint16 public immutable maximumSlippageBps;
    uint48 public immutable maximumQuoteAge;
    bool private entered;
    error InvalidRoute();
    error InvalidAmount();
    error InvalidQuote();
    error Expired();
    error Reentered();
    error TokenCallFailed();
    error UnexpectedBalance();
    error RedemptionSlippage();
    error SwapSlippage();
    error DepositSlippage();
    event AtomicSwap(
        address indexed account,
        address indexed tokenIn,
        address indexed tokenOut,
        address sourceVault,
        address destinationVault,
        uint256 amountIn,
        uint256 assetsIn,
        uint256 assetsOut,
        uint256 amountOut
    );

    constructor(address v3, address v4, address allowanceTransfer, uint16 maxSlippageBps, uint48 maxQuoteAge) {
        if (v3.code.length == 0 || v4.code.length == 0 || allowanceTransfer.code.length == 0) revert InvalidRoute();
        if (maxSlippageBps > 1000 || maxQuoteAge == 0 || maxQuoteAge > 300) revert InvalidQuote();
        adapterAdministrator = msg.sender;
        v3Router = v3;
        v4Router = v4;
        permit2 = allowanceTransfer;
        maximumSlippageBps = maxSlippageBps;
        maximumQuoteAge = maxQuoteAge;
    }

    /// @notice The deployment administrator approves exact adapter runtime code, or revokes with zero.
    function configureAdapter(address adapter, bytes32 codeHash) external {
        if (msg.sender != adapterAdministrator) revert Unauthorized();
        if (entered) revert Reentered();
        if (codeHash != bytes32(0) && (adapter.code.length == 0 || adapter.codehash != codeHash)) {
            revert AdapterNotApproved();
        }
        approvedAdapters[adapter] = codeHash;
        emit AdapterApprovalChanged(adapter, codeHash);
    }

    function execute(Request calldata request)
        external
        returns (uint256 assetsIn, uint256 assetsOut, uint256 amountOut)
    {
        if (entered) revert Reentered();
        entered = true;
        PoolKey[] memory pools = _validate(request);
        uint256 inputBefore = IVaultSwapToken(request.tokenIn).balanceOf(address(this));
        uint256 outputBefore = IVaultSwapToken(request.tokenOut).balanceOf(address(this));
        address receivedToken = request.destinationVault == address(0) ? request.tokenOut : request.destinationVault;
        uint256 receiverBefore = IVaultSwapToken(receivedToken).balanceOf(msg.sender);
        if (request.sourceVault == address(0)) {
            _tokenCall(
                request.tokenIn,
                abi.encodeCall(IVaultSwapToken.transferFrom, (msg.sender, address(this), request.amount))
            );
            assetsIn = IVaultSwapToken(request.tokenIn).balanceOf(address(this)) - inputBefore;
            if (assetsIn != request.amount) revert UnexpectedBalance();
        } else {
            uint256 sharesBefore = IVaultSwapToken(request.sourceVault).balanceOf(address(this));
            _tokenCall(
                request.sourceVault,
                abi.encodeCall(IVaultSwapToken.transferFrom, (msg.sender, address(this), request.amount))
            );
            if (IVaultSwapToken(request.sourceVault).balanceOf(address(this)) != sharesBefore + request.amount) {
                revert UnexpectedBalance();
            }
            IVaultSwapVault(request.sourceVault).redeem(request.amount, address(this), address(this));
            if (IVaultSwapToken(request.sourceVault).balanceOf(address(this)) != sharesBefore) {
                revert UnexpectedBalance();
            }
            assetsIn = IVaultSwapToken(request.tokenIn).balanceOf(address(this)) - inputBefore;
        }
        if (assetsIn == 0 || assetsIn > type(uint128).max) revert InvalidAmount();
        if (assetsIn < _minimum(request.quote.assetsIn, 1, 1, request.quote.slippageBps)) revert RedemptionSlippage();
        uint256 minimumOutput =
            _minimum(request.quote.assetsOut, assetsIn, request.quote.assetsIn, request.quote.slippageBps);
        if (minimumOutput > type(uint128).max) revert InvalidQuote();
        _swap(request, pools, assetsIn, minimumOutput);
        if (IVaultSwapToken(request.tokenIn).balanceOf(address(this)) != inputBefore) revert UnexpectedBalance();
        assetsOut = IVaultSwapToken(request.tokenOut).balanceOf(address(this)) - outputBefore;
        if (assetsOut < minimumOutput) revert SwapSlippage();
        if (assetsOut > type(uint128).max) revert InvalidAmount();
        if (request.destinationVault == address(0)) {
            _tokenCall(request.tokenOut, abi.encodeCall(IVaultSwapToken.transfer, (msg.sender, assetsOut)));
        } else {
            _approve(request.tokenOut, request.destinationVault, assetsOut);
            IVaultSwapVault(request.destinationVault).deposit(assetsOut, msg.sender);
            _approve(request.tokenOut, request.destinationVault, 0);
        }
        if (IVaultSwapToken(request.tokenOut).balanceOf(address(this)) != outputBefore) revert UnexpectedBalance();
        amountOut = IVaultSwapToken(receivedToken).balanceOf(msg.sender) - receiverBefore;
        if (request.destinationVault == address(0) && amountOut != assetsOut) revert UnexpectedBalance();
        if (
            amountOut < _minimum(request.quote.amountOut, assetsOut, request.quote.assetsOut, request.quote.slippageBps)
        ) revert DepositSlippage();
        emit AtomicSwap(
            msg.sender,
            request.tokenIn,
            request.tokenOut,
            request.sourceVault,
            request.destinationVault,
            request.amount,
            assetsIn,
            assetsOut,
            amountOut
        );
        entered = false;
    }

    function _minimum(uint256 quoted, uint256 actualBasis, uint256 quotedBasis, uint16 bps)
        private
        pure
        returns (uint256)
    {
        return Math.mulDiv(quoted, actualBasis * (10000 - bps), quotedBasis * 10000, Math.Rounding.Ceil);
    }

    function _validate(Request calldata r) private view returns (PoolKey[] memory pools) {
        Quote calldata q = r.quote;
        if (
            q.quotedAt > block.timestamp || q.deadline < block.timestamp || q.deadline < q.quotedAt
                || q.deadline - q.quotedAt > maximumQuoteAge
        ) revert Expired();
        if (
            q.slippageBps > maximumSlippageBps || q.assetsIn == 0 || q.assetsOut == 0 || q.amountOut == 0
                || q.assetsIn > type(uint128).max || q.assetsOut > type(uint128).max || q.amountOut > type(uint128).max
        ) revert InvalidQuote();
        if (r.amount == 0 || r.amount > type(uint128).max) revert InvalidAmount();
        if (r.tokenIn.code.length == 0 || r.tokenOut.code.length == 0 || r.tokenIn == r.tokenOut) {
            revert InvalidRoute();
        }
        if (
            r.sourceVault != address(0)
                && (r.sourceVault.code.length == 0 || IVaultSwapVault(r.sourceVault).asset() != r.tokenIn)
        ) revert InvalidRoute();
        if (
            r.destinationVault != address(0)
                && (r.destinationVault.code.length == 0 || IVaultSwapVault(r.destinationVault).asset() != r.tokenOut)
        ) revert InvalidRoute();
        if (r.sourceVault == address(0) && q.assetsIn != r.amount) revert InvalidQuote();
        if (r.destinationVault == address(0) && q.amountOut != q.assetsOut) revert InvalidQuote();
        address current = r.tokenIn;
        address[] memory seen;
        uint256 hops;
        if (r.protocol == 3) {
            if (r.path.length < 43 || (r.path.length - 20) % 23 != 0) revert InvalidRoute();
            hops = (r.path.length - 20) / 23;
            seen = new address[](hops + 1);
            seen[0] = current;
            bytes calldata path = r.path;
            address first;
            assembly { first := shr(96, calldataload(path.offset)) }
            if (first != current) revert InvalidRoute();
            for (uint256 i; i < hops; i++) {
                uint256 offset = 20 + i * 23;
                uint24 fee;
                address next;
                assembly {
                    fee := shr(232, calldataload(add(path.offset, offset)))
                    next := shr(96, calldataload(add(add(path.offset, offset), 3)))
                }
                if (fee == 0 || fee >= 1000000 || next.code.length == 0) revert InvalidRoute();
                for (uint256 j; j <= i; j++) {
                    if (seen[j] == next) revert InvalidRoute();
                }
                seen[i + 1] = next;
                current = next;
            }
        } else if (r.protocol == 4) {
            pools = abi.decode(r.path, (PoolKey[]));
            hops = pools.length;
            if (hops == 0 || keccak256(r.path) != keccak256(abi.encode(pools))) revert InvalidRoute();
            seen = new address[](hops + 1);
            seen[0] = current;
            for (uint256 i; i < hops; i++) {
                PoolKey memory key = pools[i];
                if (
                    key.currency0 >= key.currency1 || key.hooks != address(0) || key.fee >= 1000000
                        || key.tickSpacing <= 0 || key.tickSpacing > 32767
                ) revert InvalidRoute();
                address next;
                if (current == key.currency0) next = key.currency1;
                else if (current == key.currency1) next = key.currency0;
                else revert InvalidRoute();
                if (next.code.length == 0) revert InvalidRoute();
                for (uint256 j; j <= i; j++) {
                    if (seen[j] == next) revert InvalidRoute();
                }
                seen[i + 1] = next;
                current = next;
            }
        } else if (r.protocol == 5) {
            DexStep[] memory steps = abi.decode(r.path, (DexStep[]));
            if (steps.length == 0 || keccak256(r.path) != keccak256(abi.encode(steps))) revert InvalidRoute();
            seen = new address[](steps.length + 1);
            seen[0] = current;
            for (uint256 i; i < steps.length; i++) {
                _adapter(steps[i].adapter);
                address next = steps[i].tokenOut;
                if (next.code.length == 0) revert InvalidRoute();
                for (uint256 j; j <= i; j++) {
                    if (seen[j] == next) revert InvalidRoute();
                }
                seen[i + 1] = next;
                current = next;
            }
        } else {
            revert InvalidRoute();
        }
        if (current != r.tokenOut) revert InvalidRoute();
    }

    function _swap(Request calldata r, PoolKey[] memory pools, uint256 assets, uint256 minimumOutput) private {
        if (r.protocol == 3) {
            _approve(r.tokenIn, v3Router, assets);
            IVaultSwapV3Router(v3Router)
                .exactInput(IVaultSwapV3Router.ExactInputParams(r.path, address(this), assets, minimumOutput));
            _approve(r.tokenIn, v3Router, 0);
        } else if (r.protocol == 5) {
            DexStep[] memory steps = abi.decode(r.path, (DexStep[]));
            address current = r.tokenIn;
            uint256 amount = assets;
            for (uint256 i; i < steps.length; i++) {
                amount =
                    _adapterHop(steps[i], current, amount, i + 1 == steps.length ? minimumOutput : 1, r.quote.deadline);
                current = steps[i].tokenOut;
            }
        } else {
            address current = r.tokenIn;
            uint256 amount = assets;
            for (uint256 i; i < pools.length; i++) {
                PoolKey memory key = pools[i];
                address output = current == key.currency0 ? key.currency1 : key.currency0;
                amount =
                    _v4Hop(key, current, output, amount, i + 1 == pools.length ? minimumOutput : 1, r.quote.deadline);
                current = output;
            }
        }
    }

    function _adapterHop(DexStep memory step, address input, uint256 amount, uint256 minimum, uint48 deadline)
        private
        returns (uint256 received)
    {
        _adapter(step.adapter);
        uint256 beforeIn = IVaultSwapToken(input).balanceOf(address(this));
        uint256 beforeOut = IVaultSwapToken(step.tokenOut).balanceOf(address(this));
        _approve(input, step.adapter, amount);
        IDexAdapter(step.adapter).swap(input, step.tokenOut, amount, minimum, deadline, step.data);
        _approve(input, step.adapter, 0);
        if (IVaultSwapToken(input).balanceOf(address(this)) != beforeIn - amount) revert UnexpectedBalance();
        received = IVaultSwapToken(step.tokenOut).balanceOf(address(this)) - beforeOut;
        if (received < minimum) revert SwapSlippage();
        if (received > type(uint128).max) revert InvalidAmount();
    }

    function _adapter(address adapter) private view {
        bytes32 pin = approvedAdapters[adapter];
        if (pin == bytes32(0) || adapter.codehash != pin) revert AdapterNotApproved();
    }

    function _v4Hop(
        PoolKey memory key,
        address input,
        address output,
        uint256 amount,
        uint256 minimumOutput,
        uint48 deadline
    ) private returns (uint256 received) {
        if (amount > type(uint128).max) revert InvalidAmount();
        uint256 inputBefore = IVaultSwapToken(input).balanceOf(address(this));
        uint256 outputBefore = IVaultSwapToken(output).balanceOf(address(this));
        _approve(input, permit2, amount);
        IVaultSwapPermit2(permit2).approve(input, v4Router, uint160(amount), deadline);
        bytes[] memory actions = new bytes[](3);
        actions[0] = abi.encode(
            ExactInputSingleParams(key, input == key.currency0, uint128(amount), uint128(minimumOutput), bytes(""))
        );
        actions[1] = abi.encode(input, amount);
        actions[2] = abi.encode(output, minimumOutput);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(hex"060c0f", actions);
        IVaultSwapRouter(v4Router).execute(hex"10", inputs, deadline);
        IVaultSwapPermit2(permit2).approve(input, v4Router, 0, 0);
        _approve(input, permit2, 0);
        if (IVaultSwapToken(input).balanceOf(address(this)) != inputBefore - amount) revert UnexpectedBalance();
        received = IVaultSwapToken(output).balanceOf(address(this)) - outputBefore;
        if (received < minimumOutput) revert SwapSlippage();
    }

    function _approve(address token, address spender, uint256 amount) private {
        _tokenCall(token, abi.encodeCall(IVaultSwapToken.approve, (spender, 0)));
        if (amount != 0) _tokenCall(token, abi.encodeCall(IVaultSwapToken.approve, (spender, amount)));
    }

    function _tokenCall(address token, bytes memory data) private {
        (bool success, bytes memory result) = token.call(data);
        if (!success || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) {
            revert TokenCallFailed();
        }
    }
}
