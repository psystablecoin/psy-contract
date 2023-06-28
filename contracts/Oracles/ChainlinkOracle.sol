// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;
import "../Interfaces/IOracle.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/BaseMath.sol";
import "../Dependencies/PSYMath.sol";
import "../Dependencies/Initializable.sol";

contract ChainlinkOracle is Ownable, CheckContract, BaseMath, Initializable, IOracle {
	using SafeMath for uint256;

	struct ChainlinkResponse {
		uint80 roundId;
		int256 answer;
		uint256 timestamp;
		bool success;
		uint8 decimals;
	}

	struct RegisterOracle {
		AggregatorV3Interface chainLinkOracle;
		bool isRegistered;
	}

	enum Status {
		chainlinkWorking,
		chainlinkUntrusted
	}

	// --- Events ---
	event PriceFeedStatusChanged(Status newStatus);
	event LastGoodPriceUpdated(uint256 _lastGoodPrice);
	event RegisteredNewOracle(address chainLinkAggregator);


	string public constant NAME = "ChainlinkOracle";

	address public asset;

	// Use to convert a price answer to an 18-digit precision uint
	uint256 public constant TARGET_DIGITS = 18;

	uint256 public constant TIMEOUT = 4 hours;

	// Maximum deviation allowed between two consecutive Chainlink oracle prices. 18-digit precision.
	uint256 public constant MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND = 5e17; // 50%
	uint256 public constant MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES = 5e16; // 5%

	bool public isInitialized;

	address public adminContract;

	Status public status;
	RegisterOracle public registeredOracle;
	uint256 public lastGoodPrice;

	modifier isController() {
		require(msg.sender == owner() || msg.sender == adminContract, "Invalid Permission");
		_;
	}

	function setAddresses(
		address _adminContract,
		address _token,
		address _chainlinkOracle
	) external initializer onlyOwner {
		require(!isInitialized, "Already initialized");
		checkContract(_adminContract);
		isInitialized = true;

		adminContract = _adminContract;
		status = Status.chainlinkWorking;

		asset = _token;

		AggregatorV3Interface priceOracle = AggregatorV3Interface(_chainlinkOracle);

		registeredOracle = RegisterOracle(priceOracle, true);

		(
			ChainlinkResponse memory chainlinkResponse,
			ChainlinkResponse memory prevChainlinkResponse
		) = _getChainlinkResponses(priceOracle);

		require(
			!_chainlinkIsBroken(chainlinkResponse, prevChainlinkResponse) &&
				!_chainlinkIsFrozen(chainlinkResponse),
			"PriceFeed: Chainlink must be working and current"
		);

		_storeChainlinkPrice(chainlinkResponse);

		emit RegisteredNewOracle(_chainlinkOracle);
	}

	function setAdminContract(address _admin) external onlyOwner {
		require(_admin != address(0), "Admin address is zero");
		checkContract(_admin);
		adminContract = _admin;
	}


	function getDirectPrice() external view returns (uint256 _priceAssetInSLSD) {
		
		(
			ChainlinkResponse memory chainlinkResponse,
			
		) = _getChainlinkResponses(registeredOracle.chainLinkOracle);

		uint256 scaledChainlinkPrice = _scaleChainlinkPriceByDigits(
			uint256(chainlinkResponse.answer),
			chainlinkResponse.decimals
		);

		_priceAssetInSLSD = scaledChainlinkPrice;
	}

	function fetchPrice() external override returns (uint256) {
		require(registeredOracle.isRegistered, "Oracle is not registered!");

		(
			ChainlinkResponse memory chainlinkResponse,
			ChainlinkResponse memory prevChainlinkResponse
		) = _getChainlinkResponses(registeredOracle.chainLinkOracle);

		uint256 lastTokenGoodPrice = lastGoodPrice;

		bool isChainlinkOracleBroken = _chainlinkIsBroken(
			chainlinkResponse,
			prevChainlinkResponse
		) || _chainlinkIsFrozen(chainlinkResponse);

		if (status == Status.chainlinkWorking) {
			if (isChainlinkOracleBroken) {
				if (!isChainlinkOracleBroken) {
					lastTokenGoodPrice = _storeChainlinkPrice(chainlinkResponse);
				}

				_changeStatus(Status.chainlinkUntrusted);
				return lastTokenGoodPrice;
			}

			// If Chainlink price has changed by > 50% between two consecutive rounds
			if (_chainlinkPriceChangeAboveMax(chainlinkResponse, prevChainlinkResponse)) {
				return lastTokenGoodPrice;
			}

			lastTokenGoodPrice = _storeChainlinkPrice(chainlinkResponse);

			return lastTokenGoodPrice;
		}

		if (status == Status.chainlinkUntrusted) {
			if (!isChainlinkOracleBroken) {
				_changeStatus(Status.chainlinkWorking);
			}

			if (!isChainlinkOracleBroken) {
				lastTokenGoodPrice = _storeChainlinkPrice(chainlinkResponse);
			}

			return lastTokenGoodPrice;
		}

		return lastTokenGoodPrice;
	}

	function _getChainlinkResponses(
		AggregatorV3Interface _chainLinkOracle
	)
		internal
		view
		returns (
			ChainlinkResponse memory currentChainlink,
			ChainlinkResponse memory prevChainLink
		)
	{
		currentChainlink = _getCurrentChainlinkResponse(_chainLinkOracle);
		prevChainLink = _getPrevChainlinkResponse(
			_chainLinkOracle,
			currentChainlink.roundId,
			currentChainlink.decimals
		);
		
		return (currentChainlink, prevChainLink);
	}

	function _chainlinkIsBroken(
		ChainlinkResponse memory _currentResponse,
		ChainlinkResponse memory _prevResponse
	) internal view returns (bool) {
		return _badChainlinkResponse(_currentResponse) || _badChainlinkResponse(_prevResponse);
	}

	function _badChainlinkResponse(ChainlinkResponse memory _response)
		internal
		view
		returns (bool)
	{
		if (!_response.success) {
			return true;
		}
		if (_response.roundId == 0) {
			return true;
		}
		if (_response.timestamp == 0 || _response.timestamp > block.timestamp) {
			return true;
		}
		if (_response.answer <= 0) {
			return true;
		}

		return false;
	}

	function _chainlinkIsFrozen(ChainlinkResponse memory _response)
		internal
		view
		returns (bool)
	{
		return block.timestamp.sub(_response.timestamp) > TIMEOUT;
	}

	function _chainlinkPriceChangeAboveMax(
		ChainlinkResponse memory _currentResponse,
		ChainlinkResponse memory _prevResponse
	) internal pure returns (bool) {
		uint256 currentScaledPrice = _scaleChainlinkPriceByDigits(
			uint256(_currentResponse.answer),
			_currentResponse.decimals
		);
		uint256 prevScaledPrice = _scaleChainlinkPriceByDigits(
			uint256(_prevResponse.answer),
			_prevResponse.decimals
		);

		uint256 minPrice = PSYMath._min(currentScaledPrice, prevScaledPrice);
		uint256 maxPrice = PSYMath._max(currentScaledPrice, prevScaledPrice);

		/*
		 * Use the larger price as the denominator:
		 * - If price decreased, the percentage deviation is in relation to the the previous price.
		 * - If price increased, the percentage deviation is in relation to the current price.
		 */
		uint256 percentDeviation = maxPrice.sub(minPrice).mul(DECIMAL_PRECISION).div(maxPrice);

		// Return true if price has more than doubled, or more than halved.
		return percentDeviation > MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND;
	}

	function _scaleChainlinkPriceByDigits(uint256 _price, uint256 _answerDigits)
		internal
		pure
		returns (uint256)
	{
		uint256 price;
		if (_answerDigits >= TARGET_DIGITS) {
			// Scale the returned price value down to SLSD's target precision
			price = _price.div(10**(_answerDigits - TARGET_DIGITS));
		} else if (_answerDigits < TARGET_DIGITS) {
			// Scale the returned price value up to SLSD's target precision
			price = _price.mul(10**(TARGET_DIGITS - _answerDigits));
		}
		return price;
	}

	function _changeStatus(Status _status) internal {
		status = _status;
		emit PriceFeedStatusChanged(_status);
	}

	function _storeChainlinkPrice(ChainlinkResponse memory _chainlinkResponse)
		internal
		returns (uint256)
	{
		uint256 scaledChainlinkPrice = _scaleChainlinkPriceByDigits(
			uint256(_chainlinkResponse.answer),
			_chainlinkResponse.decimals
		);

		_storePrice(scaledChainlinkPrice);
		return scaledChainlinkPrice;
	}

	function _storePrice(uint256 _currentPrice) internal {
		lastGoodPrice = _currentPrice;
		emit LastGoodPriceUpdated(_currentPrice);
	}

	// --- Oracle response wrapper functions ---

	function _getCurrentChainlinkResponse(AggregatorV3Interface _priceAggregator)
		internal
		view
		returns (ChainlinkResponse memory chainlinkResponse)
	{
		try _priceAggregator.decimals() returns (uint8 decimals) {
			chainlinkResponse.decimals = decimals;
		} catch {
			return chainlinkResponse;
		}

		try _priceAggregator.latestRoundData() returns (
			uint80 roundId,
			int256 answer,
			uint256, /* startedAt */
			uint256 timestamp,
			uint80 /* answeredInRound */
		) {
			chainlinkResponse.roundId = roundId;
			chainlinkResponse.answer = answer;
			chainlinkResponse.timestamp = timestamp;
			chainlinkResponse.success = true;
			return chainlinkResponse;
		} catch {
			return chainlinkResponse;
		}
	}

	function _getPrevChainlinkResponse(
		AggregatorV3Interface _priceAggregator,
		uint80 _currentRoundId,
		uint8 _currentDecimals
	) internal view returns (ChainlinkResponse memory prevChainlinkResponse) {
		if (_currentRoundId == 0) {
			return prevChainlinkResponse;
		}

		unchecked {
			try _priceAggregator.getRoundData(_currentRoundId - 1) returns (
				uint80 roundId,
				int256 answer,
				uint256, /* startedAt */
				uint256 timestamp,
				uint80 /* answeredInRound */
			) {
				prevChainlinkResponse.roundId = roundId;
				prevChainlinkResponse.answer = answer;
				prevChainlinkResponse.timestamp = timestamp;
				prevChainlinkResponse.decimals = _currentDecimals;
				prevChainlinkResponse.success = true;
				return prevChainlinkResponse;
			} catch {
				return prevChainlinkResponse;
			}
		}
	}
}
