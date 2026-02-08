// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface liquidityPool {
    function syncAMM(address pair) external;
}

contract sendToPair {
    function sendAndSync(address pool, address token, address pair, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(token.code.length > 0, "Token is not a contract");
        require(pair != address(0), "Invalid pair address");
        require(amount > 0, "Amount must be greater than zero");
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, msg.sender, pair, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Token transfer failed");
        liquidityPool(pool).syncAMM(pair);
    }
}