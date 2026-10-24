// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

contract ExecutionCounter {
    uint256 public calls;
    uint256 public lastValue;

    function work(uint256 value) external payable {
        calls++;
        lastValue = value;
    }
}
