// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "../Interfaces/IRamsesPair.sol";
import "../Interfaces/IUniswapV3Pool.sol";
import "../Interfaces/IOracle.sol";
import "../Dependencies/TickMath.sol";
import "../Oracles/ConcentratedLiquidityBasePriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract sfrxETHOracle is IOracle, Ownable, ConcentratedLiquidityBasePriceOracle{

	struct VolatilityStats {
		uint256 lastTimeResponse;
		uint256 lastCheckTime;
		bool isCoolDown;
	}
	
	mapping(bytes => VolatilityStats) public assetStats;

	uint256 public maxVolatilityAllowance;
	uint256 public volatilityCoolDownTime;

	address public immutable WETHUSDC;
	address public immutable frxETHETH;
	address public immutable weth;
	address public immutable usdc;
	address public keeper;
	uint256 public sfrxRates;
	bool initialPriceFetched;

	// Use to convert a price answer to an 18-digit precision uint
	uint256 public constant TARGET_DECIMAL_1E18 = 1e18;

	
	constructor(
		address _WETHUSDC,
		address _frxETHWETH,
		address _weth,
		address _usdc
	) {
		require(_WETHUSDC != address(0), "Invalid WETHUSDC address");
		require(_frxETHWETH != address(0), "Invalid frxETHETH address");
		require(_weth != address(0), "Invalid weth address");
		require(_usdc != address(0), "Invalid usdc address");
		WETHUSDC = _WETHUSDC;
		frxETHETH = _frxETHWETH;
		weth = _weth;
		usdc = _usdc;
		keeper = msg.sender;
		maxVolatilityAllowance = 5e16; //5%
		volatilityCoolDownTime = 5 minutes;
		sfrxRates = 1e18;
	}

	function commitRates(uint256 _rates) external {
		require(msg.sender == keeper, "Only keeper can commit rates");
		sfrxRates = _rates;
	}

	function setKeeper(address _keeper) external onlyOwner {
		require(_keeper != address(0), "Invalid keeper address");
		keeper = _keeper;
	}

	function setSafetyParams(uint256 _volatilityAllowance, uint256 _volatilityCoolDown) external onlyOwner {
		maxVolatilityAllowance = _volatilityAllowance;
		volatilityCoolDownTime = _volatilityCoolDown;
	}

	/**
	* @notice Get the token price price for an underlying token address.
	* @return Price denominated in USDC
	*/
	function getDirectPrice() external view returns (uint256) {
		uint _lastWETHUSDPrice = assetStats[bytes("WETHUSDC")].lastTimeResponse;
		uint _lastFrxETHPrice = assetStats[bytes("frxETHPrice")].lastTimeResponse;
		uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
		uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));
		
		if( _WETHUSDPrice > _lastWETHUSDPrice){
			if(_WETHUSDPrice - _lastWETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = _checkPriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, true);
			}
		} else {
			if( _lastWETHUSDPrice - _WETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = _checkPriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, false);
			}
		}

		if( _frxETHPrice > _lastFrxETHPrice){
			if( _frxETHPrice - _lastFrxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = _checkPriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, true);
			}
		} else {
			if( _lastFrxETHPrice - _frxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = _checkPriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, false);
			}
		}

		uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
		return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;
	}

	/**
	* @notice Get and Update the token price price for an underlying token address.
	* @return Price denominated in　USDC
	*/
	function fetchPrice() external returns (uint256) {
			
		uint256 _lastWETHUSDPrice = assetStats[bytes("WETHUSDC")].lastTimeResponse;
		uint256 _lastFrxETHPrice = assetStats[bytes("frxETHPrice")].lastTimeResponse;
		uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
		uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));

		if(!initialPriceFetched){
			assetStats[bytes("WETHUSDC")].lastTimeResponse = _WETHUSDPrice;
			assetStats[bytes("frxETHPrice")].lastTimeResponse = _frxETHPrice;
			assetStats[bytes("WETHUSDC")].lastCheckTime = block.timestamp;
			assetStats[bytes("frxETHPrice")].lastCheckTime = block.timestamp;
			_lastWETHUSDPrice = _WETHUSDPrice;
			_lastFrxETHPrice = _frxETHPrice;	
			initialPriceFetched = true;
		}
		
		if( _WETHUSDPrice > _lastWETHUSDPrice){
			if(_WETHUSDPrice - _lastWETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = _updatePriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, true);
			}
		} else {
			if( _lastWETHUSDPrice - _WETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = _updatePriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, false);
			}
		}

		if( _frxETHPrice > _lastFrxETHPrice){
			if( _frxETHPrice - _lastFrxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = _updatePriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, true);
			}
		} else {
			if( _lastFrxETHPrice - _frxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = _updatePriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, false);
			}
		}

		uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
		return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;

	}

	function _checkPriceAndCoolDown(bytes memory _asset, uint256 _current, uint256 _recorded, bool _isUpward) internal view returns (uint256 _returnPrice){
		_returnPrice = _current;
		if (!assetStats[_asset].isCoolDown){
			_returnPrice = _returnLimitVolatility(_recorded, _isUpward);
		} else {
			if(volatilityCoolDownTime >= block.timestamp - assetStats[_asset].lastCheckTime){
				_returnPrice = _returnLimitVolatility(_recorded, _isUpward);
			}
		}
	}

	function _updatePriceAndCoolDown(bytes memory _asset, uint256 _current, uint256 _recorded, bool _isUpward) internal returns (uint256 _returnPrice){
		_returnPrice = _current;
		if (!assetStats[_asset].isCoolDown){
			assetStats[_asset].isCoolDown = true;
			_returnPrice = _returnLimitVolatility(_recorded, _isUpward);
		} else {
			if(block.timestamp - assetStats[_asset].lastCheckTime >= volatilityCoolDownTime){
				assetStats[_asset].lastCheckTime = block.timestamp;
				assetStats[_asset].isCoolDown = false;
				assetStats[_asset].lastTimeResponse = _current;
			} else {
				_returnPrice = _returnLimitVolatility(_recorded, _isUpward);
			}
		}
	}

	function _returnLimitVolatility(uint256 _recorded, bool _isUpward) internal view returns (uint256) {
		if(_isUpward){
			return _recorded + _recorded * maxVolatilityAllowance / TARGET_DECIMAL_1E18;
		} else {
			return _recorded - _recorded * maxVolatilityAllowance / TARGET_DECIMAL_1E18;
		}
	}


	/**
	* @dev Fetches the price for a token from Solidly Pair
	*/
	function _priceRamses(address _baseToken, IRamsesPair _pair) internal view returns (uint256) {

		address _token0 = _pair.token0();
		address _token1 = _pair.token1();
		address _quoteToken;

		_baseToken == _token0 ? _quoteToken = _token1 : _quoteToken = _token0;

		// base token is USD or another token
		uint256 _baseTokensPerQuoteToken = _pair.current(_quoteToken, 10**uint256(IERC20Metadata(_quoteToken).decimals()));
		
		// scale tokenPrice by TARGET_DECIMAL_1E18
		uint256 _baseTokenDecimals = uint256(IERC20Metadata(_baseToken).decimals());
		uint256 _tokenPriceScaled;

		if (_baseTokenDecimals > 18) {
			_tokenPriceScaled = _baseTokensPerQuoteToken / (10**(_baseTokenDecimals - 18));
		} else {
			_tokenPriceScaled = _baseTokensPerQuoteToken * (10**(18 - _baseTokenDecimals));
		}
	
		return _tokenPriceScaled;

	}
	
	function _priceUniV3(address _baseToken, IUniswapV3Pool _pool) internal view returns (uint256) {
		uint32[] memory secondsAgos = new uint32[](2);
		uint256 _twapWindow = 5 minutes;

		secondsAgos[0] = uint32(_twapWindow);
		secondsAgos[1] = 0;

		(int56[] memory tickCumulatives, ) = _pool.observe(secondsAgos);

		int24 _tick = int24((tickCumulatives[1] - tickCumulatives[0]) / int56(int256(_twapWindow)));
		uint160 _sqrtPriceX96 = TickMath.getSqrtRatioAtTick(_tick);

		uint256 _tokenPrice = getPriceX96FromSqrtPriceX96(_pool.token1(), _baseToken, _sqrtPriceX96);

		// scale tokenPrice by 1e18
		uint256 _baseTokenDecimals = uint256(IERC20Metadata(_baseToken).decimals());
		uint256 _tokenPriceScaled;

		if (_baseTokenDecimals > 18) {
			_tokenPriceScaled = _tokenPrice / (10**(_baseTokenDecimals - 18));
		} else {
			_tokenPriceScaled = _tokenPrice * (10**(18 - _baseTokenDecimals));
		}

		return _tokenPriceScaled;

	}

}