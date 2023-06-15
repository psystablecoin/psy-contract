// SPDX-License-Identifier: MIT

pragma solidity ^0.8.14;

import "../Dependencies/ERC20Permit.sol";

contract ERC20Test is ERC20Permit {

	uint8 private DECIMALS = 18;
	mapping(address => bool) public minted;

	constructor() ERC20("ERC Test", "TST") {}

	function mint(address _addr, uint256 _amount) public {
		require(minted[_addr] != true, "ERC20Test: minted");
		_mint(_addr, _amount);
		minted[_addr] = true;
	}

	function transferFrom(
		address sender,
		address recipient,
		uint256 amount
	) public override returns (bool) {
		_transfer(sender, recipient, amount);
		return true;
	}

	function decimals() public view override returns (uint8) {
		return DECIMALS;
	}

	function setDecimals(uint8 _decimals) public {
		DECIMALS = _decimals;
	}
}
