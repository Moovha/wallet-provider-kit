// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.37;

interface IReadOnlySafe {
    function masterCopy() external view returns (address);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function VERSION() external view returns (string memory);
    function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory, address);
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
}
interface IReadOnlyEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256);
}
interface IReadOnlySafe4337Module {
    function SUPPORTED_ENTRYPOINT() external view returns (address);
}

/// @notice Read-only validation code supplied to eth_call through a temporary code override.
/// @dev Never deployed or submitted as a transaction. All wallet calls are STATICCALLs.
contract SafeStateReader {
    struct Profile {
        address wallet;
        address singleton;
        address owner;
        address module;
        address entryPoint;
    }

    struct Inspection {
        Profile profile;
        address[] targets;
        bytes32[] hashes;
        bool[] allowEmpty;
    }

    /// @notice Isolate each read: a rejected account never rejects another account's proof.
    function inspect4337Batch(Inspection[] calldata items)
        external view returns (bool[] memory valid, uint256[] memory nonces)
    {
        require(items.length > 0 && items.length <= 10, "batch count");
        valid = new bool[](items.length);
        nonces = new uint256[](items.length);
        for (uint256 i; i < items.length; ++i) {
            Inspection calldata item = items[i];
            try this.inspect4337{gas: 2_000_000}(
                item.profile, item.targets, item.hashes, item.allowEmpty
            ) returns (uint256 nonce) {
                valid[i] = true;
                nonces[i] = nonce;
            } catch {}
        }
    }

    function inspect4337(Profile calldata p, address[] calldata targets, bytes32[] calldata hashes, bool[] calldata allowEmpty)
        external view returns (uint256)
    {
        require(targets.length == hashes.length && targets.length == allowEmpty.length && targets.length <= 128, "pin count");
        require(p.owner != address(this), "owner collision");
        for (uint256 i; i < targets.length; ++i) {
            require(targets[i] != address(this), "reader collision");
            require(targets[i].code.length != 0 || allowEmpty[i], "empty code");
            require(keccak256(targets[i].code) == hashes[i], "code mismatch");
        }
        return inspect4337Authority(p);
    }
    function inspect4337Authority(Profile calldata p) private view returns(uint256) {
        IReadOnlySafe safe = IReadOnlySafe(p.wallet);
        require(safe.masterCopy() == p.singleton, "singleton mismatch");
        address[] memory owners = safe.getOwners();
        require(owners.length == 1 && owners[0] == p.owner, "owner mismatch");
        require(safe.getThreshold() == 1, "threshold mismatch");
        require(keccak256(bytes(safe.VERSION())) == keccak256("1.4.1"), "version mismatch");
        (address[] memory modules, address next) = safe.getModulesPaginated(address(1), 2);
        require(modules.length == 1 && modules[0] == p.module && next == address(1), "module mismatch");
        bytes memory guard = safe.getStorageAt(uint256(keccak256("guard_manager.guard.address")), 1);
        bytes memory handler = safe.getStorageAt(uint256(keccak256("fallback_manager.handler.address")), 1);
        require(guard.length == 32 && abi.decode(guard, (uint256)) == 0, "guard enabled");
        require(handler.length == 32 && abi.decode(handler, (uint256)) == uint256(uint160(p.module)), "handler mismatch");
        require(IReadOnlySafe4337Module(p.module).SUPPORTED_ENTRYPOINT() == p.entryPoint, "entrypoint mismatch");
        uint256 nonce = IReadOnlyEntryPoint(p.entryPoint).getNonce(p.wallet, 0);
        require(nonce < 2 ** 64, "nonce domain");
        return nonce;
    }
}
