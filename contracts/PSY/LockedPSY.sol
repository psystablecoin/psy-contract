// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../Dependencies/CheckContract.sol";

/*
This contract is reserved for Linear Vesting to the Team members and the Advisors team.
*/
contract LockedPSY is Ownable, ReentrancyGuard, CheckContract {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	struct Rule {
		uint256 createdDate;
		uint256 totalSupply;
		uint256 startVestingDate;
		uint256 endVestingDate;
		uint256 claimed;
	}

	string public constant NAME = "LockedPSY";
	uint256 public constant TWO_YEARS = 730 days;
	uint256 public constant ONE_YEAR = 365 days;

	bool public isInitialized;

	IERC20 private psyToken;
	uint256 private assignedPSYTokens;

	mapping(address => Rule) public entitiesVesting;

	modifier entityRuleExists(address _entity) {
		require(entitiesVesting[_entity].createdDate != 0, "Entity doesn't have a Vesting Rule");
		_;
	}

	function setAddresses(address _monAddress) external onlyOwner {
		require(!isInitialized, "Already Initialized");
		checkContract(_monAddress);
		isInitialized = true;

		psyToken = IERC20(_monAddress);
	}

	function addEntityVestingBatch(address[] memory _entities, uint256[] memory _totalSupplies)
		external
		onlyOwner
	{
		require(_entities.length == _totalSupplies.length, "Array length missmatch");

		uint256 _sumTotalSupplies = 0;

		for (uint256 i = 0; i < _entities.length; i++) {
			address _entity = _entities[i];
			uint256 _totalSupply = _totalSupplies[i];

			require(address(0) != _entity, "Invalid Address");

			require(entitiesVesting[_entity].createdDate == 0, "Entity already has a Vesting Rule");

			entitiesVesting[_entity] = Rule(
				block.timestamp,
				_totalSupply,
				block.timestamp.add(ONE_YEAR),
				block.timestamp.add(TWO_YEARS),
				0
			);

			_sumTotalSupplies += _totalSupply;
		}

		assignedPSYTokens += _sumTotalSupplies;

		psyToken.safeTransferFrom(msg.sender, address(this), _sumTotalSupplies);
	}

	function addEntityVesting(address _entity, uint256 _totalSupply) external onlyOwner {
		require(address(0) != _entity, "Invalid Address");

		require(entitiesVesting[_entity].createdDate == 0, "Entity already has a Vesting Rule");

		assignedPSYTokens += _totalSupply;

		entitiesVesting[_entity] = Rule(
			block.timestamp,
			_totalSupply,
			block.timestamp.add(ONE_YEAR),
			block.timestamp.add(TWO_YEARS),
			0
		);

		psyToken.safeTransferFrom(msg.sender, address(this), _totalSupply);
	}

	function lowerEntityVesting(address _entity, uint256 newTotalSupply)
		external
		nonReentrant
		onlyOwner
		entityRuleExists(_entity)
	{
		sendPSYTokenToEntity(_entity);
		Rule storage vestingRule = entitiesVesting[_entity];

		require(
			newTotalSupply > vestingRule.claimed,
			"Total Supply goes lower or equal than the claimed total."
		);

		vestingRule.totalSupply = newTotalSupply;
	}

	function removeEntityVesting(address _entity)
		external
		nonReentrant
		onlyOwner
		entityRuleExists(_entity)
	{
		sendPSYTokenToEntity(_entity);
		Rule memory vestingRule = entitiesVesting[_entity];

		assignedPSYTokens = assignedPSYTokens.sub(
			vestingRule.totalSupply.sub(vestingRule.claimed)
		);

		delete entitiesVesting[_entity];
	}

	function claimPSYToken() public entityRuleExists(msg.sender) {
		sendPSYTokenToEntity(msg.sender);
	}

	function sendPSYTokenToEntity(address _entity) private {
		uint256 unclaimedAmount = getClaimablePSY(_entity);
		if (unclaimedAmount == 0) return;

		Rule storage entityRule = entitiesVesting[_entity];
		entityRule.claimed += unclaimedAmount;

		assignedPSYTokens = assignedPSYTokens.sub(unclaimedAmount);
		psyToken.safeTransfer(_entity, unclaimedAmount);
	}

	function transferUnassignedPSY() external onlyOwner {
		uint256 unassignedTokens = getUnassignPSYTokensAmount();

		if (unassignedTokens == 0) return;

		psyToken.safeTransfer(msg.sender, unassignedTokens);
	}

	function getClaimablePSY(address _entity) public view returns (uint256 claimable) {
		Rule memory entityRule = entitiesVesting[_entity];
		claimable = 0;

		if (entityRule.startVestingDate > block.timestamp) return claimable;

		if (block.timestamp >= entityRule.endVestingDate) {
			claimable = entityRule.totalSupply.sub(entityRule.claimed);
		} else {
			claimable = entityRule
				.totalSupply
				.mul(block.timestamp.sub(entityRule.startVestingDate))
				.div(ONE_YEAR)
				.sub(entityRule.claimed);
		}

		return claimable;
	}

	function getUnassignPSYTokensAmount() public view returns (uint256) {
		return psyToken.balanceOf(address(this)).sub(assignedPSYTokens);
	}

	function isEntityExits(address _entity) public view returns (bool) {
		return entitiesVesting[_entity].createdDate != 0;
	}
}
