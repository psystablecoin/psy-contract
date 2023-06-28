// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../Dependencies/FullMath.sol";

abstract contract ConcentratedLiquidityBasePriceOracle {

  
  function getPriceX96FromSqrtPriceX96(
    address token0,
    address priceToken,
    uint160 sqrtPriceX96
  ) public pure returns (uint256 _price) {
    if (token0 == priceToken) {
      _price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint256(2**(96 * 2)) / 1e18);
    } else {
      _price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint256(2**(96 * 2)) / 1e18);
      _price = 1e36 / _price;
    }
  }


}
