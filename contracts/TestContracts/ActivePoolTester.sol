// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;
import "../ActivePool.sol";

contract ActivePoolTester is ActivePool {
	using SafeMath for uint256;

	function unprotectedIncreaseSLSDDebt(address _asset, uint256 _amount) external {
		SLSDDebts[_asset] = SLSDDebts[_asset].add(_amount);
	}

	function unprotectedPayable(address _asset, uint256 amount) external payable {
		amount = _asset == address(0) ? msg.value : amount;
		assetsBalance[_asset] = assetsBalance[_asset].add(msg.value);
	}
}
