// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IDexAdapter {
    /// @notice Pull exact input from the caller and return actual output to that caller.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) external returns (uint256 amountOut);
}

interface IDexToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IDexV3Router {
    struct Params {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(Params calldata params) external payable returns (uint256);
}

interface IDexSlipstreamRouter {
    struct Params {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(Params calldata params) external payable returns (uint256);
}

interface IDexAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 minimumOut,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory);
}

interface IDexUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IDexPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @notice Stateless exact-input adapters. Routers receive bounded approvals, never delegatecall.
abstract contract DexAdapter is IDexAdapter {
    address public immutable router;
    bytes32 public immutable routerCodeHash;
    bool private entered;
    error InvalidRoute();
    error InvalidAmount();
    error Expired();
    error Reentered();
    error DependencyChanged();
    error TokenCallFailed();
    error UnexpectedBalance();
    error Slippage();

    constructor(address target) {
        if (target.code.length == 0) revert InvalidRoute();
        router = target;
        routerCodeHash = target.codehash;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) external returns (uint256 amountOut) {
        if (entered) revert Reentered();
        entered = true;
        if (router.codehash != routerCodeHash) revert DependencyChanged();
        if (deadline < block.timestamp) revert Expired();
        if (tokenIn == tokenOut || tokenIn.code.length == 0 || tokenOut.code.length == 0) revert InvalidRoute();
        if (amountIn == 0 || amountIn > type(uint128).max || minimumOut == 0 || minimumOut > type(uint128).max) {
            revert InvalidAmount();
        }
        uint256 inputBefore = IDexToken(tokenIn).balanceOf(address(this));
        uint256 outputBefore = IDexToken(tokenOut).balanceOf(address(this));
        uint256 receiverBefore = IDexToken(tokenOut).balanceOf(msg.sender);
        _tokenCall(tokenIn, abi.encodeCall(IDexToken.transferFrom, (msg.sender, address(this), amountIn)));
        if (IDexToken(tokenIn).balanceOf(address(this)) != inputBefore + amountIn) revert UnexpectedBalance();
        _swap(tokenIn, tokenOut, amountIn, minimumOut, deadline, data);
        if (IDexToken(tokenIn).balanceOf(address(this)) != inputBefore) revert UnexpectedBalance();
        amountOut = IDexToken(tokenOut).balanceOf(address(this)) - outputBefore;
        if (amountOut < minimumOut) revert Slippage();
        if (amountOut > type(uint128).max) revert InvalidAmount();
        _tokenCall(tokenOut, abi.encodeCall(IDexToken.transfer, (msg.sender, amountOut)));
        if (
            IDexToken(tokenOut).balanceOf(address(this)) != outputBefore
                || IDexToken(tokenOut).balanceOf(msg.sender) != receiverBefore + amountOut
        ) revert UnexpectedBalance();
        entered = false;
    }

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) internal virtual;

    function _approve(address token, address spender, uint256 amount) internal {
        _tokenCall(token, abi.encodeCall(IDexToken.approve, (spender, 0)));
        if (amount != 0) _tokenCall(token, abi.encodeCall(IDexToken.approve, (spender, amount)));
    }

    function _tokenCall(address token, bytes memory data) internal {
        (bool ok, bytes memory result) = token.call(data);
        if (!ok || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) {
            revert TokenCallFailed();
        }
    }
}

contract UniswapV3DexAdapter is DexAdapter {
    constructor(address target) DexAdapter(target) {}

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minimumOut, uint48, bytes calldata data)
        internal
        override
    {
        if (data.length != 32) revert InvalidRoute();
        uint24 fee = abi.decode(data, (uint24));
        if (fee == 0 || fee >= 1000000) revert InvalidRoute();
        _approve(tokenIn, router, amountIn);
        IDexV3Router(router)
            .exactInput(
                IDexV3Router.Params(abi.encodePacked(tokenIn, fee, tokenOut), address(this), amountIn, minimumOut)
            );
        _approve(tokenIn, router, 0);
    }
}

contract AerodromeSlipstreamDexAdapter is DexAdapter {
    constructor(address target) DexAdapter(target) {}

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) internal override {
        if (data.length != 32) revert InvalidRoute();
        int24 spacing = abi.decode(data, (int24));
        if (spacing <= 0 || spacing > 32767) revert InvalidRoute();
        _approve(tokenIn, router, amountIn);
        IDexSlipstreamRouter(router)
            .exactInput(
                IDexSlipstreamRouter.Params(
                    abi.encodePacked(tokenIn, spacing, tokenOut), address(this), deadline, amountIn, minimumOut
                )
            );
        _approve(tokenIn, router, 0);
    }
}

contract AerodromeClassicDexAdapter is DexAdapter {
    constructor(address target) DexAdapter(target) {}

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) internal override {
        if (data.length != 64) revert InvalidRoute();
        (bool stable, address factory) = abi.decode(data, (bool, address));
        if (factory.code.length == 0) revert InvalidRoute();
        IDexAerodromeRouter.Route[] memory routes = new IDexAerodromeRouter.Route[](1);
        routes[0] = IDexAerodromeRouter.Route(tokenIn, tokenOut, stable, factory);
        _approve(tokenIn, router, amountIn);
        IDexAerodromeRouter(router).swapExactTokensForTokens(amountIn, minimumOut, routes, address(this), deadline);
        _approve(tokenIn, router, 0);
    }
}

contract UniswapV4DexAdapter is DexAdapter {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct Params {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }
    address public immutable permit2;
    bytes32 public immutable permit2CodeHash;

    constructor(address target, address allowanceTransfer) DexAdapter(target) {
        if (allowanceTransfer.code.length == 0) revert InvalidRoute();
        permit2 = allowanceTransfer;
        permit2CodeHash = allowanceTransfer.codehash;
    }

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint48 deadline,
        bytes calldata data
    ) internal override {
        if (permit2.codehash != permit2CodeHash) revert DependencyChanged();
        if (data.length != 160) revert InvalidRoute();
        PoolKey memory key = abi.decode(data, (PoolKey));
        if (
            key.currency0 >= key.currency1 || key.hooks != address(0) || key.fee >= 1000000 || key.tickSpacing <= 0
                || key.tickSpacing > 32767
        ) revert InvalidRoute();
        if (!((tokenIn == key.currency0 && tokenOut == key.currency1)
                    || (tokenIn == key.currency1 && tokenOut == key.currency0))) revert InvalidRoute();
        _approve(tokenIn, permit2, amountIn);
        IDexPermit2(permit2).approve(tokenIn, router, uint160(amountIn), deadline);
        bytes[] memory actions = new bytes[](3);
        actions[0] =
            abi.encode(Params(key, tokenIn == key.currency0, uint128(amountIn), uint128(minimumOut), bytes("")));
        actions[1] = abi.encode(tokenIn, amountIn);
        actions[2] = abi.encode(tokenOut, minimumOut);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(hex"060c0f", actions);
        IDexUniversalRouter(router).execute(hex"10", inputs, deadline);
        IDexPermit2(permit2).approve(tokenIn, router, 0, 0);
        _approve(tokenIn, permit2, 0);
    }
}
