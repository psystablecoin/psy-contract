// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "../Interfaces/IRamsesPair.sol";
import "../Interfaces/IUniswapV3Pool.sol";
import "../Interfaces/IOracle.sol";
import "../Dependencies/TickMath.sol";
import "../Oracles/ConcentratedLiquidityBasePriceOracle.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract SfrxETHOracleTest is ConcentratedLiquidityBasePriceOracle, Ownable{

	struct VolatilityStats {
		uint256 lastTimeResponse;
		uint256 lastCheckTime;
		bool isCoolDown;
	}
	

	mapping(bytes => VolatilityStats) public assetStats;
	mapping(uint256 => uint256) public price;

	uint256 public maxVolatilityAllowance;
	uint256 public volatilityCoolDownTime;
	
	uint256 public sfrxRates;
	bool initialPriceFetched;

	// Use to convert a price answer to an 18-digit precision uint
	uint256 public constant TARGET_DECIMAL_1E18 = 1e18;

	constructor() {
		maxVolatilityAllowance = 5e16; //5%
		volatilityCoolDownTime = 5 minutes;
		sfrxRates = 1e18;
	}

	/**
	* @dev Fetches the price for a token from Solidly Pair
	*/
	function priceRamses(address _baseToken, IRamsesPair _pair) external view returns (uint256) {

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
	
	function priceUniV3(address _baseToken, IUniswapV3Pool _pool) external view returns (uint256) {
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

	function getPriceMock(uint _id)public view returns (uint256){
		return price[_id];
	}

	function setPriceMock(uint _id, uint _price)public{
		price[_id] = _price;
	}

	function commitRates(uint256 _rates) external {
		sfrxRates = _rates;
	}

	function setSafetyParams(uint256 _volatilityAllowance, uint256 _volatilityCoolDown) external onlyOwner {
		maxVolatilityAllowance = _volatilityAllowance;
		volatilityCoolDownTime = _volatilityCoolDown;
	}

	function getDirectPrice() external view returns (uint256) {
		uint _lastWETHUSDPrice = assetStats[bytes("WETHUSDC")].lastTimeResponse;
		uint _lastFrxETHPrice = assetStats[bytes("frxETHPrice")].lastTimeResponse;
		uint256 _WETHUSDPrice = getPriceMock(0);
		uint256 _frxETHPrice = getPriceMock(1);
		
		if( _WETHUSDPrice > _lastWETHUSDPrice){
			if(_WETHUSDPrice - _lastWETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = checkPriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, true);
			}
		} else {
			if( _lastWETHUSDPrice - _WETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_WETHUSDPrice = checkPriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, false);
			}
		}

		if( _frxETHPrice > _lastFrxETHPrice){
			if( _frxETHPrice - _lastFrxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = checkPriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, true);
			}
		} else {
			if( _lastFrxETHPrice - _frxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = checkPriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, false);
			}
		}

		uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
		return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;
	}

	function fetchPrice() external returns (uint256) {
			
		uint256 _lastWETHUSDPrice = assetStats[bytes("WETHUSDC")].lastTimeResponse;
		uint256 _lastFrxETHPrice = assetStats[bytes("frxETHPrice")].lastTimeResponse;
		uint256 _WETHUSDPrice = getPriceMock(0);
		uint256 _frxETHPrice = getPriceMock(1);

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
				console.log("WETH Price too high");
				_WETHUSDPrice = updatePriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, true);
			}
		} else {
			if( _lastWETHUSDPrice - _WETHUSDPrice >= _lastWETHUSDPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				console.log("WETH Price too low");
				_WETHUSDPrice = updatePriceAndCoolDown(bytes("WETHUSDC"), _WETHUSDPrice, _lastWETHUSDPrice, false);
			}
		}

		if( _frxETHPrice > _lastFrxETHPrice){
			if( _frxETHPrice - _lastFrxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = updatePriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, true);
			}
		} else {
			if( _lastFrxETHPrice - _frxETHPrice >= _lastFrxETHPrice * maxVolatilityAllowance / TARGET_DECIMAL_1E18){
				_frxETHPrice = updatePriceAndCoolDown(bytes("frxETHPrice"), _frxETHPrice, _lastFrxETHPrice, false);
			}
		}

		uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
		return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;

	}

	function checkPriceAndCoolDown(bytes memory _asset, uint256 _current, uint256 _recorded, bool _isUpward) internal view returns (uint256 _returnPrice){
		_returnPrice = _current;
		if (!assetStats[_asset].isCoolDown){
			_returnPrice = returnLimitVolatility(_recorded, _isUpward);
		} else {
			if(volatilityCoolDownTime >= block.timestamp - assetStats[_asset].lastCheckTime){
				_returnPrice = returnLimitVolatility(_recorded, _isUpward);
			}
		}
	}

	function updatePriceAndCoolDown(bytes memory _asset, uint256 _current, uint256 _recorded, bool _isUpward) internal returns (uint256 _returnPrice){
		_returnPrice = _current;
		if (!assetStats[_asset].isCoolDown){
			console.log("Cooling down started");
			assetStats[_asset].isCoolDown = true;
			_returnPrice = returnLimitVolatility(_recorded, _isUpward);
		} else {
			if(block.timestamp - assetStats[_asset].lastCheckTime >= volatilityCoolDownTime){
				console.log("Cooling down ended");
				assetStats[_asset].lastCheckTime = block.timestamp;
				assetStats[_asset].isCoolDown = false;
				assetStats[_asset].lastTimeResponse = _current;
			} else {
				console.log("Cooling down not ended");
				_returnPrice = returnLimitVolatility(_recorded, _isUpward);
			}
		}
	}

	function returnLimitVolatility(uint256 _recorded, bool _isUpward) internal view returns (uint256) {
		if(_isUpward){
			return _recorded + _recorded * maxVolatilityAllowance / TARGET_DECIMAL_1E18;
		} else {
			return _recorded - _recorded * maxVolatilityAllowance / TARGET_DECIMAL_1E18;
		}
	}


}