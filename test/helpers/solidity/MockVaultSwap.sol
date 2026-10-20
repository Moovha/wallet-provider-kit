// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {IDexSlipstreamRouter, IDexAerodromeRouter} from "DexAdapters.sol";
import {AtomicVaultSwap} from "AtomicVaultSwap.sol";

contract VaultSwapTokenFixture {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract VaultSwapVaultFixture is VaultSwapTokenFixture {
    VaultSwapTokenFixture public immutable asset;
    bool public failDeposit;
    uint256 public redemptionBps = 10000;
    uint256 public depositBps = 10000;

    function setRates(uint256 redemption, uint256 deposit_) external {
        redemptionBps = redemption;
        depositBps = deposit_;
    }

    constructor(address token) {
        asset = VaultSwapTokenFixture(token);
    }

    function setFailDeposit(bool fail) external {
        failDeposit = fail;
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256) {
        require(msg.sender == owner);
        balanceOf[owner] -= shares;
        asset.transfer(receiver, shares * 2 * redemptionBps / 10000);
        return 999999;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        require(!failDeposit);
        asset.transferFrom(msg.sender, address(this), assets);
        balanceOf[receiver] += assets / 2 * depositBps / 10000;
        return 999999;
    }
}

contract VaultSwapPermitFixture {
    mapping(address => mapping(address => mapping(address => uint256))) public allowance;

    function approve(address token, address spender, uint160 amount, uint48) external {
        allowance[msg.sender][token][spender] = amount;
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        allowance[from][token][msg.sender] -= amount;
        VaultSwapTokenFixture(token).transferFrom(from, to, amount);
    }
}

contract VaultSwapRouterFixture {
    struct V3Params {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    VaultSwapPermitFixture public immutable permit2;
    uint256 public rate = 30000;
    bool public failSwap;
    bool public partialInput;
    bool public reenter;
    address public reentryTarget;
    uint256 public callCount;
    bool public lastStable;
    address public lastFactory;

    function setReentryTarget(address target) external {
        reentryTarget = target;
    }

    constructor(address p) {
        permit2 = VaultSwapPermitFixture(p);
    }

    function setRate(uint256 value) external {
        rate = value;
    }

    function setFailSwap(bool value) external {
        failSwap = value;
    }

    function setPartialInput(bool value) external {
        partialInput = value;
    }

    function setReenter(bool value) external {
        reenter = value;
    }

    function _reenter() private {
        if (!reenter) return;
        AtomicVaultSwap.Request memory r;
        AtomicVaultSwap(reentryTarget == address(0) ? msg.sender : reentryTarget).execute(r);
    }

    function exactInput(V3Params calldata params) external payable returns (uint256) {
        return _pathSwap(params.path, params.recipient, params.amountIn, params.amountOutMinimum);
    }

    function exactInput(IDexSlipstreamRouter.Params calldata params) external payable returns (uint256) {
        require(params.deadline >= block.timestamp);
        return _pathSwap(params.path, params.recipient, params.amountIn, params.amountOutMinimum);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 minimumOut,
        IDexAerodromeRouter.Route[] calldata routes,
        address recipient,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(routes.length == 1 && deadline >= block.timestamp);
        lastStable = routes[0].stable;
        lastFactory = routes[0].factory;
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] =
            _pathSwap(abi.encodePacked(routes[0].from, uint24(1), routes[0].to), recipient, amountIn, minimumOut);
    }

    function _pathSwap(bytes memory path, address recipient, uint256 amountIn, uint256 minimumOut)
        private
        returns (uint256 amountOut)
    {
        require(!failSwap);
        _reenter();
        callCount++;
        address input;
        address output;
        assembly {
            input := shr(96, mload(add(path, 32)))
            output := shr(96, mload(add(add(path, 32), sub(mload(path), 20))))
        }
        uint256 hops = (path.length - 20) / 23;
        amountOut = amountIn;
        for (uint256 i; i < hops; i++) {
            amountOut = amountOut * rate / 10000;
        }
        require(amountOut >= minimumOut);
        VaultSwapTokenFixture(input).transferFrom(msg.sender, address(this), partialInput ? amountIn - 1 : amountIn);
        VaultSwapTokenFixture(output).transfer(recipient, amountOut);
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256) external payable {
        callCount++;
        require(!failSwap && keccak256(commands) == keccak256(hex"10") && inputs.length == 1);
        (bytes memory actions, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        require(keccak256(actions) == keccak256(hex"060c0f") && params.length == 3);
        AtomicVaultSwap.ExactInputSingleParams memory swap =
            abi.decode(params[0], (AtomicVaultSwap.ExactInputSingleParams));
        (address input, uint256 maximum) = abi.decode(params[1], (address, uint256));
        (address output, uint256 minimum) = abi.decode(params[2], (address, uint256));
        require(input == (swap.zeroForOne ? swap.poolKey.currency0 : swap.poolKey.currency1));
        require(output == (swap.zeroForOne ? swap.poolKey.currency1 : swap.poolKey.currency0));
        uint256 amountOut = maximum * rate / 10000;
        require(swap.amountIn == maximum && minimum == swap.amountOutMinimum && amountOut >= minimum);
        _reenter();
        permit2.transferFrom(msg.sender, address(this), uint160(partialInput ? maximum - 1 : maximum), input);
        VaultSwapTokenFixture(output).transfer(msg.sender, amountOut);
    }
}
