# SLSD Contracts

## General Information

This repository's codebase was originally mostly from Liquity and was changed to accept multiple collateral.

## Changes

The main changes are:

### Multiple collateral support
SLSD can be minted with multiple Liquid Staking Derivatives. To allow multiple collateralization, the codebase is modified.

### No PSY token at launch
PSY, the governance token is not available at launch. the original codebase distributes and mint new tokens when users interact with contracts. The change turned off these functions at launch.

### Adjusted Oracle mechanism
Oracle has been changed to support exotic assets.

### Flash minting
Flashminting to support a variety of arbitrage operations.

## Getting Started

### Requirements

A working Node.js >=16.0 installation

Otherwise, you need to install Node Version Manager (nvm) https://github.com/nvm-sh/nvm

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
nvm install 18
nvm use 18
nvm alias default 18
npm install npm --global # Upgrade npm to the latest version
```

### Build

To build the project

First clone the repository locally

```
git clone https://github.com/psystablecoin/psy-contracts.git
```

Switch to the repository directory

```
cd psy-contracts
```

Install the dependencies

```
npm i
```

Once all the packages are installed, just run this command to compile the contracts and build the artifacts:

```
npx hardhat compile
```

### Test

Prior to running the tests you need to make sure the required packages are installed (`npm i`). Also, create a `secrets.js` file in the project's root folder from the template `secrets.js.template` and add your `INFURA_API_KEY`.

To run all the tests on a local mainnet fork (default network is `hardhat`):

```
npx hardhat test
```

or for a specific test e.g `BorrowerOperationsTest`

```
npx hardhat test test/core/BorrowerOperationsTest.js
```

or for a specific test and specific network e.g `BorrowerOperationsTest` and network hardhat

```
npx hardhat test test/core/BorrowerOperationsTest.js -- network hardhat
```

Some tests fails because they are forking a real network.
To test such tests, you need to delete comment outs of `hardhat.config.js`

### Deploy

Prior to running the deploy scripts you need to make sure the required packages are installed (`npm i`).

Then, proceed along the following steps to deploy the entire protocol:

1. Create a `secrets.js` file in the project's root folder from the template `secrets.js.template`. Add the `INFURA_API_KEY`, the `DEPLOYER_PRIVATEKEY` and the `ETHERSCAN_API_KEY` for mainnet deployment (or the Goerli parameters for testnet deployment).
2. Update the addresses on lines 16-18 in `deployment/deploymentParams/deploymentParams.mainnet.js` (or the goerli file for testnet deployment) to reflect your specific setting. The Deployer address needs to reflect the private key set in the `secrets.js` file. Verify the oracle addresses on lines 5-18 and parameter `GAS_PRICE` (if `GAS_PRICE` is too low you risk your deploy transactions getting stuck).
3. You can choose to either deploy only the PSY contracts (see `PSY` folder) or the entire protocol. Set the parameter `PSY_TOKEN_ONLY` to handle this
4. Run `npx hardhat run deployment/deploymentScripts/mainnetDeployment.js --network mainnet` (or the Goerli references for testnet deployment), to deploy the contracts.
5. You can check and verify the contracts by checking the output file in `deployment/output/mainnetDeploymentOutput.json`.

## Important Notes

The contract PSYParameters.sol contains all the parameters from the system and should not be modified. However, the system is set to block redemptions in it's first 14 days. For testing purposes, it's recommended to change it for a lower value. You can find it on the line 15.

