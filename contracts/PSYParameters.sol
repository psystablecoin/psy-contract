//SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./Dependencies/CheckContract.sol";
import "./Dependencies/Initializable.sol";
import "./Interfaces/IPSYParameters.sol";

contract PSYParameters is IPSYParameters, Ownable, CheckContract, Initializable {
	string public constant NAME = "PSYParameters";

	uint256 public constant override DECIMAL_PRECISION = 1 ether;
	uint256 public constant override _100pct = 1 ether; // 1e18 == 100%

	uint256 public constant REDEMPTION_BLOCK_DAY = 14;

	uint256 public constant MCR_DEFAULT = 1100000000000000000; // 110%
	uint256 public constant CCR_DEFAULT = 1500000000000000000; // 150%
	uint256 public constant CEIL_DEFAULT = 1000000000000000000000 ether; // (Must be ~100K for production)
	uint256 public constant PERCENT_DIVISOR_DEFAULT = 100; // dividing by 100 yields 1%

	uint256 public constant BORROWING_FEE_FLOOR_DEFAULT = (DECIMAL_PRECISION / 1000) * 5; // 0.5%
	uint256 public constant MAX_BORROWING_FEE_DEFAULT = (DECIMAL_PRECISION / 100) * 5; // 5%

	uint256 public constant SLSD_GAS_COMPENSATION_DEFAULT = 20 ether;
	uint256 public constant MIN_NET_DEBT_DEFAULT = 2000 ether;
	uint256 public constant REDEMPTION_FEE_FLOOR_DEFAULT = (DECIMAL_PRECISION / 1000) * 5; // 0.5%

	// Minimum collateral ratio for individual troves
	mapping(address => uint256) public override MCR;
	// Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
	mapping(address => uint256) public override CCR;

	mapping(address => uint256) public override SLSD_GAS_COMPENSATION; // Amount of SLSD to be locked in gas pool on opening troves
	mapping(address => uint256) public override MIN_NET_DEBT; // Minimum amount of net SLSD debt a trove must have
	mapping(address => uint256) public override DEBT_CEILINGS; // Maximum amount of net SLSD debt for an asset
	mapping(address => uint256) public override PERCENT_DIVISOR; // dividing by 200 yields 0.5%
	mapping(address => uint256) public override BORROWING_FEE_FLOOR;
	mapping(address => uint256) public override REDEMPTION_FEE_FLOOR;
	mapping(address => uint256) public override MAX_BORROWING_FEE;
	mapping(address => uint256) public override MAX_REDEMPTION_FEE;
	mapping(address => uint256) public override redemptionBlock;

	mapping(address => bool) internal hasCollateralConfigured;

	IActivePool public override activePool;
	
	IDefaultPool public override defaultPool;
	IPriceFeed public override priceFeed;
	address public adminContract;
	
	bool public isInitialized;

	modifier isController() {
		require(msg.sender == owner() || msg.sender == adminContract, "Invalid Permissions");
		_;
	}

	function setAddresses(
		address _activePool,
		address _defaultPool,
		address _priceFeed,
		address _adminContract
	) external override initializer onlyOwner {
		require(!isInitialized, "Already initalized");
		checkContract(_activePool);
		checkContract(_defaultPool);
		checkContract(_priceFeed);
		checkContract(_adminContract);
		isInitialized = true;

		adminContract = _adminContract;
		activePool = IActivePool(_activePool);
		defaultPool = IDefaultPool(_defaultPool);
		priceFeed = IPriceFeed(_priceFeed);
	}

	function setAdminContract(address _admin) external onlyOwner {
		require(_admin != address(0), "admin address is zero");
		checkContract(_admin);
		adminContract = _admin;
	}

	function setPriceFeed(address _priceFeed) external override onlyOwner {
		checkContract(_priceFeed);
		priceFeed = IPriceFeed(_priceFeed);

		emit PriceFeedChanged(_priceFeed);
	}

	function sanitizeParameters(address _asset) external {
		if (!hasCollateralConfigured[_asset]) {
			_setAsDefault(_asset);
		}
	}

	function setAsDefault(address _asset) external onlyOwner {
		_setAsDefault(_asset);
	}

	function setAsDefaultWithRemptionBlock(address _asset, uint256 blockInDays)
		external
		isController
	{
		if (blockInDays > 14) {
			blockInDays = REDEMPTION_BLOCK_DAY;
		}

		if (redemptionBlock[_asset] == 0) {
			redemptionBlock[_asset] = block.timestamp + (blockInDays * 1 days);
		}

		_setAsDefault(_asset);
	}

	function _setAsDefault(address _asset) private {
		hasCollateralConfigured[_asset] = true;

		MCR[_asset] = MCR_DEFAULT;
		CCR[_asset] = CCR_DEFAULT;
		SLSD_GAS_COMPENSATION[_asset] = SLSD_GAS_COMPENSATION_DEFAULT;
		MIN_NET_DEBT[_asset] = MIN_NET_DEBT_DEFAULT;
		PERCENT_DIVISOR[_asset] = PERCENT_DIVISOR_DEFAULT;
		BORROWING_FEE_FLOOR[_asset] = BORROWING_FEE_FLOOR_DEFAULT;
		MAX_BORROWING_FEE[_asset] = MAX_BORROWING_FEE_DEFAULT;
		MAX_REDEMPTION_FEE[_asset] = DECIMAL_PRECISION;
		REDEMPTION_FEE_FLOOR[_asset] = REDEMPTION_FEE_FLOOR_DEFAULT;
		DEBT_CEILINGS[_asset] = CEIL_DEFAULT;
	}

	function setCollateralParameters(
		address _asset,
		uint256 newMCR,
		uint256 newCCR,
		uint256 gasCompensation,
		uint256 minNetDebt,
		uint256 precentDivisor,
		uint256 borrowingFeeFloor,
		uint256 maxBorrowingFee,
		uint256 redemptionFeeFloor,
		uint256 debtCeiling
	) external onlyOwner {
		hasCollateralConfigured[_asset] = true;

		setMCR(_asset, newMCR);
		setCCR(_asset, newCCR);
		setSLSDGasCompensation(_asset, gasCompensation);
		setMinNetDebt(_asset, minNetDebt);
		setPercentDivisor(_asset, precentDivisor);
		setMaxBorrowingFee(_asset, maxBorrowingFee);
		setBorrowingFeeFloor(_asset, borrowingFeeFloor);
		setMaxRedemptionFee(_asset, 10000);
		setRedemptionFeeFloor(_asset, redemptionFeeFloor);
		setDebtCeiling(_asset, debtCeiling);
	}

	function setDebtCeiling(address _asset, uint256 newLimit)
		public
		override
		onlyOwner
	{
		uint256 oldLimit = DEBT_CEILINGS[_asset];
		DEBT_CEILINGS[_asset] = newLimit;

		emit DebtCeilingChanged(oldLimit, newLimit);
	}

	function setMCR(address _asset, uint256 newMCR)
		public
		override
		onlyOwner
		safeCheck("MCR", _asset, newMCR, 1010000000000000000, 10000000000000000000) /// 101% - 1000%
	{
		uint256 oldMCR = MCR[_asset];
		MCR[_asset] = newMCR;

		emit MCRChanged(oldMCR, newMCR);
	}

	function setCCR(address _asset, uint256 newCCR)
		public
		override
		onlyOwner
		safeCheck("CCR", _asset, newCCR, 1010000000000000000, 10000000000000000000) /// 101% - 1000%
	{
		uint256 oldCCR = CCR[_asset];
		CCR[_asset] = newCCR;

		emit CCRChanged(oldCCR, newCCR);
	}

	function setPercentDivisor(address _asset, uint256 precentDivisor)
		public
		override
		onlyOwner
		safeCheck("Percent Divisor", _asset, precentDivisor, 2, 200)
	{
		uint256 oldPercent = PERCENT_DIVISOR[_asset];
		PERCENT_DIVISOR[_asset] = precentDivisor;

		emit PercentDivisorChanged(oldPercent, precentDivisor);
	}

	function setBorrowingFeeFloor(address _asset, uint256 borrowingFeeFloor)
		public
		override
		onlyOwner
		safeCheck("Borrowing Fee Floor", _asset, borrowingFeeFloor, 0, 1000) /// 0% - 10%
	{
		uint256 oldBorrowing = BORROWING_FEE_FLOOR[_asset];
		uint256 newBorrowingFee = (DECIMAL_PRECISION / 10000) * borrowingFeeFloor;

		BORROWING_FEE_FLOOR[_asset] = newBorrowingFee;
		require(MAX_BORROWING_FEE[_asset] > BORROWING_FEE_FLOOR[_asset], "Wrong inputs");

		emit BorrowingFeeFloorChanged(oldBorrowing, newBorrowingFee);
	}

	function setMaxBorrowingFee(address _asset, uint256 maxBorrowingFee)
		public
		override
		onlyOwner
		safeCheck("Max Borrowing Fee", _asset, maxBorrowingFee, 0, 1000) /// 0% - 10%
	{
		uint256 oldMaxBorrowingFee = MAX_BORROWING_FEE[_asset];
		uint256 newMaxBorrowingFee = (DECIMAL_PRECISION / 10000) * maxBorrowingFee;

		MAX_BORROWING_FEE[_asset] = newMaxBorrowingFee;
		require(MAX_BORROWING_FEE[_asset] > BORROWING_FEE_FLOOR[_asset], "Wrong inputs");

		emit MaxBorrowingFeeChanged(oldMaxBorrowingFee, newMaxBorrowingFee);
	}

	function setSLSDGasCompensation(address _asset, uint256 gasCompensation)
		public
		override
		onlyOwner
		safeCheck("Gas Compensation", _asset, gasCompensation, 1 ether, 200 ether)
	{
		uint256 oldGasComp = SLSD_GAS_COMPENSATION[_asset];
		SLSD_GAS_COMPENSATION[_asset] = gasCompensation;

		emit GasCompensationChanged(oldGasComp, gasCompensation);
	}

	function setMinNetDebt(address _asset, uint256 minNetDebt)
		public
		override
		onlyOwner
		safeCheck("Min Net Debt", _asset, minNetDebt, 0, 10000 ether)
	{
		uint256 oldMinNet = MIN_NET_DEBT[_asset];
		MIN_NET_DEBT[_asset] = minNetDebt;

		emit MinNetDebtChanged(oldMinNet, minNetDebt);
	}

	function setRedemptionFeeFloor(address _asset, uint256 redemptionFeeFloor)
		public
		override
		onlyOwner
		safeCheck("Redemption Fee Floor", _asset, redemptionFeeFloor, 0, 1000) /// 0% - 10%
	{
		uint256 oldRedemptionFeeFloor = REDEMPTION_FEE_FLOOR[_asset];
		uint256 newRedemptionFeeFloor = (DECIMAL_PRECISION / 10000) * redemptionFeeFloor;

		REDEMPTION_FEE_FLOOR[_asset] = newRedemptionFeeFloor;
		require(MAX_REDEMPTION_FEE[_asset] > REDEMPTION_FEE_FLOOR[_asset], "Wrong inputs");

		emit RedemptionFeeFloorChanged(oldRedemptionFeeFloor, newRedemptionFeeFloor);
	}

	function setMaxRedemptionFee(address _asset, uint256 maxRedemptionFee)
		public
		override
		onlyOwner
		safeCheck("Max Redemption Fee", _asset, maxRedemptionFee, 0, 10000) /// 0% - 100%
	{
		uint256 oldMaxRedemptionFee = MAX_REDEMPTION_FEE[_asset];
		uint256 newMaxRedemptionFee = (DECIMAL_PRECISION / 10000) * maxRedemptionFee;

		MAX_REDEMPTION_FEE[_asset] = newMaxRedemptionFee;
		require(MAX_REDEMPTION_FEE[_asset] > REDEMPTION_FEE_FLOOR[_asset], "Wrong inputs");

		emit MaxRedemptionFeeChanged(oldMaxRedemptionFee, maxRedemptionFee);
	}

	function removeRedemptionBlock(address _asset) external override onlyOwner {
		redemptionBlock[_asset] = block.timestamp;

		emit RedemptionBlockRemoved(_asset);
	}

	modifier safeCheck(
		string memory parameter,
		address _asset,
		uint256 enteredValue,
		uint256 min,
		uint256 max
	) {
		require(
			hasCollateralConfigured[_asset],
			"Collateral is not configured, use setAsDefault or setCollateralParameters"
		);

		if (enteredValue < min || enteredValue > max) {
			revert SafeCheckError(parameter, enteredValue, min, max);
		}
		_;
	}
}
