const { TestHelper: th, TimeValues: timeVals } = require("../helpers/testHelpers.js")
const { dec } = th

const DeploymentHelper = require("../helpers/deploymentHelpers.js")
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants")
const { ethers, run } = require("hardhat")
const toBN = ethers.BigNumber.from


let mdh;
let config;
let deployerWallet;
let gasPrice;
let psyCore;
let PSYContracts;
let deploymentState;

let ADMIN_WALLET
let TREASURY_WALLET

async function mainnetDeploy(configParams) {
  console.log(new Date().toUTCString())

  config = configParams;
  gasPrice = config.GAS_PRICE;

  ADMIN_WALLET = config.psyAddresses.ADMIN_MULTI
  TREASURY_WALLET = config.psyAddresses.PSY_SAFE

  deployerWallet = (await ethers.getSigners())[0]
  mdh = new DeploymentHelper(config, deployerWallet)

  deploymentState = mdh.loadPreviousDeployment()

  console.log(`deployer address: ${deployerWallet.address}`)
  //assert.equal(deployerWallet.address, config.psyAddresses.DEPLOYER)

  console.log(`deployerETHBalance before: ${await ethers.provider.getBalance(deployerWallet.address)}`)

  // Deployment Phase 1
  if (config.DEPLOYMENT_PHASE == 1) {
    console.log("Only Deploy PSY token");

    const PSYToken = await mdh.deployPSYToken(TREASURY_WALLET, deploymentState);

    mdh.saveDeployment(deploymentState)

    console.log(`deployerETHBalance after: ${await ethers.provider.getBalance(deployerWallet.address)}`)

    return;
  }

  // Deployment Phase 2
  if (config.DEPLOYMENT_PHASE == 2) {
   
    // Deploy core logic contracts
    psyCore = await mdh.deployslsdCoreMainnet(deploymentState, ADMIN_WALLET)
    
    await mdh.logContractObjects(psyCore)

    // Deploy PSY Contracts
    PSYContracts = await mdh.deployPSYContractsMainnet(
      TREASURY_WALLET, // multisig PSY endowment address
      deploymentState,
    )

    // Connect all core contracts up
    console.log("Connect Core Contracts up");


    await mdh.connectCoreContractsMainnet(
      psyCore,
      PSYContracts
    )

    console.log("Connect PSY Contract to Core");
    await mdh.connectPSYContractsToCoreMainnet(PSYContracts, psyCore, TREASURY_WALLET)

    
    console.log("Adding Collaterals");
    const allowance = (await PSYContracts.PSYToken.allowance(deployerWallet.address, PSYContracts.communityIssuance.address));
    if (allowance == 0)
      await PSYContracts.PSYToken.approve(PSYContracts.communityIssuance.address, ethers.constants.MaxUint256)

    
    await addETHCollaterals();
    await addBTCCollaterals();
    
    mdh.saveDeployment(deploymentState)

    await mdh.deployMultiTroveGetterMainnet(psyCore, deploymentState)
    await mdh.logContractObjects(PSYContracts)

    await giveContractsOwnerships();
    
  }

}

async function addETHCollaterals() {

  const ETHAddress = !config.IsMainnet
    ? await mdh.deployMockERC20Contract(deploymentState, "mockETH", 18)
    : ethers.constants.AddressZero

  if (!ETHAddress || ETHAddress == "")
    throw ("CANNOT FIND THE ETH Address")

  if ((await psyCore.stabilityPoolManager.unsafeGetAssetStabilityPool(ETHAddress)) == ZERO_ADDRESS) {

    console.log("Creating Collateral - ETH")

    const stabilityPoolETHFactory = await ethers.getContractFactory("StabilityPool")

    const stabilityPoolETH = await stabilityPoolETHFactory.deploy();

    console.log("Deploying ETH Stability Pool");
    await stabilityPoolETH.deployed();

    console.log("Initializing ETH Stability Pool with Parameters");

    const initializeSBETH = await mdh
      .sendAndWaitForTransaction(
        stabilityPoolETH.setAddresses(
          ETHAddress,
          psyCore.borrowerOperations.address,
          psyCore.troveManager.address,
          psyCore.troveManagerHelpers.address,
          psyCore.slsdToken.address,
          psyCore.sortedTroves.address,
          PSYContracts.communityIssuance.address,
          psyCore.psyParameters.address,
          { gasPrice }
        ))

    console.log("ETH Stability Pool deployed at address: " + stabilityPoolETH.address);

    const txReceiptSBETH = await mdh
      .sendAndWaitForTransaction(
        psyCore.adminContract.addNewCollateral(
          stabilityPoolETH.address,
          config.externalAddrs.CHAINLINK_ETHUSD_PROXY,
          dec(config.psyCommunityIssuanceParams.ETH_STABILITY_POOL_FUNDING, 18),
          dec(config.psyCommunityIssuanceParams.ETH_STABILITY_POOL_WEEKLY_DISTRIBUTION, 18),
          config.REDEMPTION_SAFETY
        ),
        {gasPrice,}
      )

    console.log("Transferring Ownership to Multisig of Stability Pool ETH");

    const transferOwnershipSBETH = await mdh.sendAndWaitForTransaction(
      stabilityPoolETH.transferOwnership(
        ADMIN_WALLET
      ))


    const name = "StabilityPoolETH";

    deploymentState[name] = {
      address: stabilityPoolETH.address,
      init: initializeSBETH.transactionHash,
      txHash: txReceiptSBETH.transactionHash,
      transferOwnership: transferOwnershipSBETH.transactionHash
    }

    await mdh.verifyContract(name, deploymentState, [], false);
  }
}

async function addBTCCollaterals() {
  const BTCAddress = !config.IsMainnet
    ? await mdh.deployMockERC20Contract(deploymentState, "renBTC", 8)
    : config.externalAddrs.WRP_BTC

  if (!BTCAddress || BTCAddress == "")
    throw ("CANNOT FIND THE renBTC Address")

  if ((await psyCore.stabilityPoolManager.unsafeGetAssetStabilityPool(BTCAddress)) == ZERO_ADDRESS) {
    console.log("Creating Collateral - BTC")

    const stabilityPoolBTCFactory = await ethers.getContractFactory("StabilityPool")

    const stabilityPoolBTC = await stabilityPoolBTCFactory.deploy();

    console.log("Deploying wBTC Stability Pool");
    await stabilityPoolBTC.deployed();

    console.log("Initializing wBTC Stability Pool with Parameters");

    const initializeSBBTC = await mdh
      .sendAndWaitForTransaction(
        stabilityPoolBTC.setAddresses(
          BTCAddress,
          psyCore.borrowerOperations.address,
          psyCore.troveManager.address,
          psyCore.troveManagerHelpers.address,
          psyCore.slsdToken.address,
          psyCore.sortedTroves.address,
          PSYContracts.communityIssuance.address,
          psyCore.psyParameters.address,
          { gasPrice }
        ))

    console.log("BTC Stability Pool deployed at address: " + stabilityPoolBTC.address);

    const txReceiptSBBTC = await mdh
      .sendAndWaitForTransaction(
        psyCore.adminContract.addNewCollateral(
          stabilityPoolBTC.address,
          config.externalAddrs.CHAINLINK_BTCUSD_PROXY,
          dec(config.psyCommunityIssuanceParams.BTC_STABILITY_POOL_FUNDING, 18),
          dec(config.psyCommunityIssuanceParams.BTC_STABILITY_POOL_WEEKLY_DISTRIBUTION, 18),
          config.REDEMPTION_SAFETY), {
        gasPrice,
      })

    console.log("Transferring Ownership to Multisig of Stability Pool BTC");

    const transferOwnershipSBBTC = await mdh.sendAndWaitForTransaction(
      stabilityPoolBTC.transferOwnership(
        ADMIN_WALLET
      ))


    const name = "StabilityPoolBTC";

    deploymentState[name] = {
      address: stabilityPoolBTC.address,
      init: initializeSBBTC.transactionHash,
      txHash: txReceiptSBBTC.transactionHash,
      transferOwnership: transferOwnershipSBBTC.transactionHash
    }

    await mdh.verifyContract(name, deploymentState, [], false);

  }
}


async function giveContractsOwnerships() {
  await transferOwnership(psyCore.adminContract, ADMIN_WALLET);
  await transferOwnership(psyCore.priceFeed, ADMIN_WALLET);
  await transferOwnership(psyCore.psyParameters, ADMIN_WALLET);
  await transferOwnership(psyCore.stabilityPoolManager, ADMIN_WALLET);
  await transferOwnership(psyCore.slsdToken, ADMIN_WALLET);
  await transferOwnership(PSYContracts.PSYStaking, ADMIN_WALLET);
  await transferOwnership(PSYContracts.communityIssuance, TREASURY_WALLET);
  await transferOwnership(psyCore.troveManager, ADMIN_WALLET);
  await transferOwnership(psyCore.troveManagerHelpers, ADMIN_WALLET);
  await transferOwnership(psyCore.borrowerOperations, ADMIN_WALLET);
  await transferOwnership(psyCore.hintHelpers, ADMIN_WALLET);
}

async function transferOwnership(contract, newOwner) {

  console.log("Transfering Ownership of", contract.address)

  if (!newOwner)
    throw "Transfering ownership to null address";

  if (await contract.owner() != newOwner)
    await contract.transferOwnership(newOwner)

  console.log("Transfered Ownership of", contract.address)

}

module.exports = {
  mainnetDeploy
}
