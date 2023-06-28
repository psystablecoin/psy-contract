// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "../Interfaces/IRamsesPair.sol";
import "../Interfaces/IUniswapV3Pool.sol";
import "../Interfaces/IOracle.sol";
import "../Dependencies/TickMath.sol";
import "../Oracles/ConcentratedLiquidityBasePriceOracle.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract SfrxETHOracleTest is ConcentratedLiquidityBasePriceOracle{

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

}