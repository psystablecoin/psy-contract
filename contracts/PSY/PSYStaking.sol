// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../Dependencies/BaseMath.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/PSYMath.sol";
import "../Dependencies/Initializable.sol";
import "../Interfaces/IPSYStaking.sol";
import "../Interfaces/IDeposit.sol";
import "../Dependencies/SafetyTransfer.sol";

contract PSYStaking is
	IPSYStaking,
	Pausable,
	Ownable,
	CheckContract,
	BaseMath,
	ReentrancyGuard,
	Initializable
{
	using SafeMath for uint256;
	using SafeERC20 for IERC20;

	bool public isInitialized;

	// --- Data ---
	string public constant NAME = "PSYStaking";
	address constant ETH_REF_ADDRESS = address(0);

	mapping(address => uint256) public stakes;
	uint256 public totalPSYStaked;

	mapping(address => uint256) public F_ASSETS; // Running sum of ETH fees per-PSY-staked
	uint256 public F_SLSD; // Running sum of PSY fees per-PSY-staked

	// User snapshots of F_ETH and F_SLSD, taken at the point at which their latest deposit was made
	mapping(address => Snapshot) public snapshots;

	struct Snapshot {
		mapping(address => uint256) F_ASSET_Snapshot;
		uint256 F_SLSD_Snapshot;
	}

	address[] ASSET_TYPE;
	mapping(address => bool) isAssetTracked;
	mapping(address => uint256) public sentToTreasuryTracker;

	IERC20 public psyToken;
	IERC20 public slsdToken;

	address public troveManagerAddress;
	address public troveManagerHelpersAddress;
	address public borrowerOperationsAddress;
	address public activePoolAddress;
	address public treasury;

	// --- Functions ---
	function setAddresses(
		address _psyTokenAddress,
		address _slsdTokenAddress,
		address _troveManagerAddress,
		address _troveManagerHelpersAddress,
		address _borrowerOperationsAddress,
		address _activePoolAddress,
		address _treasury
	) external override initializer {
		require(!isInitialized, "Already Initialized");
		require(_treasury != address(0), "Invalid Treausry Address");
		checkContract(_psyTokenAddress);
		checkContract(_slsdTokenAddress);
		checkContract(_troveManagerAddress);
		checkContract(_troveManagerHelpersAddress);
		checkContract(_borrowerOperationsAddress);
		checkContract(_activePoolAddress);
		isInitialized = true;
		_pause();

		psyToken = IERC20(_psyTokenAddress);
		slsdToken = IERC20(_slsdTokenAddress);
		troveManagerAddress = _troveManagerAddress;
		troveManagerHelpersAddress = _troveManagerHelpersAddress;
		borrowerOperationsAddress = _borrowerOperationsAddress;
		activePoolAddress = _activePoolAddress;
		treasury = _treasury;

		isAssetTracked[ETH_REF_ADDRESS] = true;
		ASSET_TYPE.push(ETH_REF_ADDRESS);

		emit PSYTokenAddressSet(_psyTokenAddress);
		emit PSYTokenAddressSet(_slsdTokenAddress);
		emit TroveManagerAddressSet(_troveManagerAddress);
		emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
		emit ActivePoolAddressSet(_activePoolAddress);
	}

	// If caller has a pre-existing stake, send any accumulated ETH and SLSD gains to them.
	function stake(uint256 _PSYamount) external override nonReentrant whenNotPaused {
		require(_PSYamount > 0, "PSY amount is zero");

		uint256 currentStake = stakes[msg.sender];

		uint256 assetLength = ASSET_TYPE.length;
		uint256 AssetGain;
		address asset;

		for (uint256 i = 0; i < assetLength; i++) {
			asset = ASSET_TYPE[i];

			if (currentStake != 0) {
				AssetGain = _getPendingAssetGain(asset, msg.sender);

				if (i == 0) {
					uint256 SLSDGain = _getPendingSLSDGain(msg.sender);
					slsdToken.safeTransfer(msg.sender, SLSDGain);

					emit StakingGainsSLSDWithdrawn(msg.sender, SLSDGain);
				}

				_sendAssetGainToUser(asset, AssetGain);
				emit StakingGainsAssetWithdrawn(msg.sender, asset, AssetGain);
			}

			_updateUserSnapshots(asset, msg.sender);
		}

		uint256 newStake = currentStake.add(_PSYamount);

		// Increase user’s stake and total PSY staked
		stakes[msg.sender] = newStake;
		totalPSYStaked = totalPSYStaked.add(_PSYamount);
		emit TotalPSYStakedUpdated(totalPSYStaked);

		// Transfer PSY from caller to this contract
		psyToken.safeTransferFrom(msg.sender, address(this), _PSYamount);

		emit StakeChanged(msg.sender, newStake);
	}

	// Unstake the PSY and send the it back to the caller, along with their accumulated SLSD & ETH gains.
	// If requested amount > stake, send their entire stake.
	function unstake(uint256 _PSYamount) external override nonReentrant {
		uint256 currentStake = stakes[msg.sender];
		_requireUserHasStake(currentStake);

		uint256 assetLength = ASSET_TYPE.length;
		uint256 AssetGain;
		address asset;

		for (uint256 i = 0; i < assetLength; i++) {
			asset = ASSET_TYPE[i];

			// Grab any accumulated ETH and SLSD gains from the current stake
			AssetGain = _getPendingAssetGain(asset, msg.sender);

			if (i == 0) {
				uint256 SLSDGain = _getPendingSLSDGain(msg.sender);
				slsdToken.safeTransfer(msg.sender, SLSDGain);
				emit StakingGainsSLSDWithdrawn(msg.sender, SLSDGain);
			}

			_updateUserSnapshots(asset, msg.sender);
			emit StakingGainsAssetWithdrawn(msg.sender, asset, AssetGain);

			_sendAssetGainToUser(asset, AssetGain);
		}

		if (_PSYamount > 0) {
			uint256 PSYToWithdraw = PSYMath._min(_PSYamount, currentStake);

			uint256 newStake = currentStake.sub(PSYToWithdraw);

			// Decrease user's stake and total PSY staked
			stakes[msg.sender] = newStake;
			totalPSYStaked = totalPSYStaked.sub(PSYToWithdraw);
			emit TotalPSYStakedUpdated(totalPSYStaked);

			// Transfer unstaked PSY to user
			psyToken.safeTransfer(msg.sender, PSYToWithdraw);

			emit StakeChanged(msg.sender, newStake);
		}
	}

	function pause() public onlyOwner {
		_pause();
	}

	function unpause() external onlyOwner {
		_unpause();
	}

	function changeTreasuryAddress(address _treasury) public onlyOwner {
		require(_treasury != address(0), "Treasury address is zero");
		treasury = _treasury;
		emit TreasuryAddressChanged(_treasury);
	}

	// --- Reward-per-unit-staked increase functions. Called by PSY core contracts ---

	function increaseF_Asset(address _asset, uint256 _AssetFee)
		external
		override
		callerIsTroveManager
	{
		if (paused()) {
			sendToTreasury(_asset, _AssetFee);
			return;
		}

		if (!isAssetTracked[_asset]) {
			isAssetTracked[_asset] = true;
			ASSET_TYPE.push(_asset);
		}

		uint256 AssetFeePerPSYStaked;

		if (totalPSYStaked > 0) {
			AssetFeePerPSYStaked = _AssetFee.mul(DECIMAL_PRECISION).div(totalPSYStaked);
		}

		F_ASSETS[_asset] = F_ASSETS[_asset].add(AssetFeePerPSYStaked);
		emit F_AssetUpdated(_asset, F_ASSETS[_asset]);
	}

	function increaseF_SLSD(uint256 _SLSDFee) external override callerIsBorrowerOperations {
		if (paused()) {
			sendToTreasury(address(slsdToken), _SLSDFee);
			return;
		}

		uint256 SLSDFeePerPSYStaked;

		if (totalPSYStaked > 0) {
			SLSDFeePerPSYStaked = _SLSDFee.mul(DECIMAL_PRECISION).div(totalPSYStaked);
		}

		F_SLSD = F_SLSD.add(SLSDFeePerPSYStaked);
		emit F_SLSDUpdated(F_SLSD);
	}

	function sendToTreasury(address _asset, uint256 _amount) internal {
		_sendAsset(treasury, _asset, _amount);
		sentToTreasuryTracker[_asset] += _amount;

		emit SentToTreasury(_asset, _amount);
	}

	// --- Pending reward functions ---

	function getPendingAssetGain(address _asset, address _user)
		external
		view
		override
		returns (uint256)
	{
		return _getPendingAssetGain(_asset, _user);
	}

	function _getPendingAssetGain(address _asset, address _user)
		internal
		view
		returns (uint256)
	{
		uint256 F_ASSET_Snapshot = snapshots[_user].F_ASSET_Snapshot[_asset];
		uint256 AssetGain = stakes[_user].mul(F_ASSETS[_asset].sub(F_ASSET_Snapshot)).div(
			DECIMAL_PRECISION
		);
		return AssetGain;
	}

	function getPendingSLSDGain(address _user) external view override returns (uint256) {
		return _getPendingSLSDGain(_user);
	}

	function _getPendingSLSDGain(address _user) internal view returns (uint256) {
		uint256 F_SLSD_Snapshot = snapshots[_user].F_SLSD_Snapshot;
		uint256 SLSDGain = stakes[_user].mul(F_SLSD.sub(F_SLSD_Snapshot)).div(DECIMAL_PRECISION);
		return SLSDGain;
	}

	// --- Internal helper functions ---

	function _updateUserSnapshots(address _asset, address _user) internal {
		snapshots[_user].F_ASSET_Snapshot[_asset] = F_ASSETS[_asset];
		snapshots[_user].F_SLSD_Snapshot = F_SLSD;
		emit StakerSnapshotsUpdated(_user, F_ASSETS[_asset], F_SLSD);
	}

	function _sendAssetGainToUser(address _asset, uint256 _assetGain) internal {
		_assetGain = SafetyTransfer.decimalsCorrection(_asset, _assetGain);
		_sendAsset(msg.sender, _asset, _assetGain);
		emit AssetSent(_asset, msg.sender, _assetGain);
	}

	function _sendAsset(
		address _sendTo,
		address _asset,
		uint256 _amount
	) internal {
		if (_asset == ETH_REF_ADDRESS) {
			(bool success, ) = _sendTo.call{ value: _amount }("");
			require(success, "PSYStaking: Failed to send accumulated AssetGain");
		} else {
			IERC20(_asset).safeTransfer(_sendTo, _amount);
		}
	}

	// --- 'require' functions ---

	modifier callerIsTroveManager() {
		require(
			msg.sender == troveManagerAddress || msg.sender == troveManagerHelpersAddress,
			"PSYStaking: caller is not TroveM"
		);
		_;
	}

	modifier callerIsBorrowerOperations() {
		require(msg.sender == borrowerOperationsAddress, "PSYStaking: caller is not BorrowerOps");
		_;
	}

	modifier callerIsActivePool() {
		require(msg.sender == activePoolAddress, "PSYStaking: caller is not ActivePool");
		_;
	}

	function _requireUserHasStake(uint256 currentStake) internal pure {
		require(currentStake > 0, "PSYStaking: User must have a non-zero stake");
	}

	receive() external payable callerIsActivePool {}
}
