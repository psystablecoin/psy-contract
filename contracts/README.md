# SLSD Contracts

## General Information

This repository was initially forked from [vesta finance](https://github.com/vesta-finance/vesta-protocol-v1/releases/tag/v1.0) and was changed in order to be deployable on Ethereum Mainnet.
It contains all contracts for the SLSD ecosystem, including PSY Token, Dependencies and Interfaces.
More detailed information can be found on the [github page of liquity](https://github.com/liquity/dev).

## Important Contracts

### PSYParameters.sol

All important parameters like the default CCR (Critical Collateralization Ratio) are set here.

### SLSDToken.sol

Contains the compatible ERC-20 SLSD token.

### BorrowerOperations.sol

Serves Borrower operations for the client. E.q. openTrove(...args).

### PSYToken.sol

Contains the compatible ERC-20 PSY token.

### LockedPSY.sol

The vesting contract for PSY Airdrops etc.
