// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;
import "../PSY/CommunityIssuance.sol";

contract CommunityIssuanceTester is CommunityIssuance {
	using SafeMath for uint256;

	function obtainPSY(uint256 _amount) external {
		psyToken.transfer(msg.sender, _amount);
	}

	function getLastUpdateTokenDistribution(address stabilityPool)
		external
		view
		returns (uint256)
	{
		return _getLastUpdateTokenDistribution(stabilityPool);
	}

	function unprotectedIssuePSY(address stabilityPool) external returns (uint256) {
		return _issuePSY(stabilityPool);
	}
}
