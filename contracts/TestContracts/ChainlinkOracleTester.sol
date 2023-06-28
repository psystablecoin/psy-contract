// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "../Oracles/ChainlinkOracle.sol";

contract ChainlinkOracleTester is ChainlinkOracle {
	function setLastGoodPrice(uint256 _lastGoodPrice) external {
		lastGoodPrice = _lastGoodPrice;
	}

	function setStatus(Status _status) external {
		status = _status;
	}
}
