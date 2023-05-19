// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "../Dependencies/PSYSafeMath128.sol";

/* Tester contract for math functions in PSYSafeMath128.sol library. */

contract PSYSafeMath128Tester {
	using PSYSafeMath128 for uint128;

	function add(uint128 a, uint128 b) external pure returns (uint128) {
		return a.add(b);
	}

	function sub(uint128 a, uint128 b) external pure returns (uint128) {
		return a.sub(b);
	}
}
