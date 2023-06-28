// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "../Interfaces/IRamsesPair.sol";
import "../Interfaces/IUniswapV3Pool.sol";
import "../Interfaces/IOracle.sol";
import "../Dependencies/TickMath.sol";
import "../Oracles/ConcentratedLiquidityBasePriceOracle.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract sfrxETHOracle is IOracle, Ownable, ConcentratedLiquidityBasePriceOracle{

	mapping(bytes => uint256) public lastTimeResponses;

	uint256 public maxVolatilityAllowance;
	uint256 public volatilityCoolDown;
	uint256 public lastVolatilityCheck;

	address public WETHUSDC;
	address public frxETHETH;
	address public weth;
	address public usdc;
	address public keeper;
	uint256 public sfrxRates;
	bool public isInitialized;

	// Use to convert a price answer to an 18-digit precision uint
	uint256 public constant TARGET_DECIMAL_1E18 = 1e18;

	
	function initialize(
		address _WETHUSDC,
		address _frxETHWETH,
		address _weth,
		address _usdc
	) public {
		require(_WETHUSDC != address(0), "Invalid WETHUSDC address");
		require(_frxETHWETH != address(0), "Invalid frxETHETH address");
		require(_weth != address(0), "Invalid weth address");
		require(_usdc != address(0), "Invalid usdc address");
		WETHUSDC = _WETHUSDC;
		frxETHETH = _frxETHWETH;
		weth = _weth;
		usdc = _usdc;
		keeper = msg.sender;
		isInitialized = true;
		maxVolatilityAllowance = 1e17; //10%
		volatilityCoolDown = 5 minutes;
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
		volatilityCoolDown = _volatilityCoolDown;
	}

	/**
	* @notice Get the token price price for an underlying token address.
	* @return Price denominated in USDC
	*/
	function getDirectPrice() external view returns (uint256) {
		if(lastVolatilityCheck == 0 || lastVolatilityCheck - block.timestamp >= volatilityCoolDown){

			uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
			uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));
			uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
			return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;

		} else {
			uint _lastWETHUSDPrice = lastTimeResponses[bytes("WETHUSDC")];
			uint _lastFrxETHPrice = lastTimeResponses[bytes("frxETHPrice")];
			uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
			uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));
			
			if( _WETHUSDPrice - _lastWETHUSDPrice >= lastVolatilityCheck){
				_WETHUSDPrice = _lastWETHUSDPrice;
			}

			if( _frxETHPrice - _lastFrxETHPrice >= lastVolatilityCheck){
				_frxETHPrice = _lastFrxETHPrice;
			}

			uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
			return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;
		}
	}

	/**
	* @notice Get the token price price for an underlying token address.
	* @return Price denominated in　USDC
	*/
	function fetchPrice() external returns (uint256) {
		
		if(lastVolatilityCheck == 0 || lastVolatilityCheck - block.timestamp >= volatilityCoolDown){
			uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
			uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));
			uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;

			lastTimeResponses[bytes("WETHUSDC")] = _WETHUSDPrice;
			lastTimeResponses[bytes("frxETHPrice")] = _frxETHPrice;
			lastVolatilityCheck = block.timestamp;

			return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;
		} else {
			uint _lastWETHUSDPrice = lastTimeResponses[bytes("WETHUSDC")];
			uint _lastFrxETHPrice = lastTimeResponses[bytes("frxETHPrice")];
			uint256 _WETHUSDPrice = _priceUniV3(usdc, IUniswapV3Pool(WETHUSDC));
			uint256 _frxETHPrice = _priceRamses(weth, IRamsesPair(frxETHETH));
			
			if( _WETHUSDPrice - _lastWETHUSDPrice >= lastVolatilityCheck){
				_WETHUSDPrice = _lastWETHUSDPrice;
			}

			if( _frxETHPrice - _lastFrxETHPrice >= lastVolatilityCheck){
				_frxETHPrice = _lastFrxETHPrice;
			}

			uint256 _frxETHPriceUSD = _WETHUSDPrice * _frxETHPrice / TARGET_DECIMAL_1E18;
			return _frxETHPriceUSD * sfrxRates / TARGET_DECIMAL_1E18;
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