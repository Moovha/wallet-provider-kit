// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.37;
contract ReadSingletonFixture {}
contract ReadEntryPointFixture {
    uint256 public nonceValue = 42;
    function configure(uint256 value) external {nonceValue = value;}
    function getNonce(address, uint192) external view returns(uint256) {return nonceValue;}
}
contract ReadModuleFixture {
    address public immutable SUPPORTED_ENTRYPOINT;
    constructor(address entryPoint) {SUPPORTED_ENTRYPOINT = entryPoint;}
}
contract ReadSafeFixture {
    address public expectedOwner;
    address public singleton;
    uint256 public fault;
    address public enabledModule;
    function configureModule(address value) external {enabledModule = value;}
    constructor(address owner, address implementation) { expectedOwner = owner; singleton = implementation; }
    function configure(uint256 value) external { fault = value; }
    function masterCopy() external view returns (address) { return fault == 7 ? address(7) : singleton; }
    function getOwners() external view returns (address[] memory values) {
        values = new address[](fault == 8 ? 2 : 1);
        values[0] = fault == 1 ? address(8) : expectedOwner;
    }
    function getThreshold() external view returns (uint256) { return fault == 2 ? 2 : 1; }
    function VERSION() external view returns (string memory) { return fault == 4 ? "1.3.0" : "1.4.1"; }
    function nonce() external pure returns (uint256) { return 42; }
    function getModulesPaginated(address, uint256) external view returns (address[] memory values, address next) {
        if (enabledModule != address(0)) {values = new address[](fault == 3 ? 2 : 1); values[0] = enabledModule; return(values,address(1));}
        values = new address[](fault == 3 ? 1 : 0); next = address(1);
        if (values.length > 0) values[0] = address(9);
    }
    function getStorageAt(uint256 offset, uint256) external view returns (bytes memory) {
        bool badGuard = fault == 5 && offset == uint256(keccak256("guard_manager.guard.address"));
        bool badFallback = fault == 6 && offset == uint256(keccak256("fallback_manager.handler.address"));
        if (offset == uint256(keccak256("fallback_manager.handler.address"))) return abi.encode(uint256(badFallback ? 1 : uint160(enabledModule)));
        return abi.encode(uint256(badGuard ? 1 : 0));
    }
}
