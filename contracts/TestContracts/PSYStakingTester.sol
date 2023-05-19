// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "../PSY/PSYStaking.sol";

contract PSYStakingTester is PSYStaking {
	function requireCallerIsTroveManager() external view callerIsTroveManager {}
}
