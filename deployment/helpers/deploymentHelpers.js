const { ParamType } = require('ethers/lib/utils')
const fs = require('fs')

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)

class DeploymentHelper {
  constructor(configParams, deployerWallet) {
    this.configParams = configParams
    this.deployerWallet = deployerWallet
    this.hre = require("hardhat")
  }

  loadPreviousDeployment() {
    let previousDeployment = {}
    if (fs.existsSync(this.configParams.OUTPUT_FILE)) {
      console.log(`Loading previous deployment...`)
      previousDeployment = require('../.' + this.configParams.OUTPUT_FILE)
    }

    return previousDeployment
  }

  saveDeployment(deploymentState) {
    const deploymentStateJSON = JSON.stringify(deploymentState, null, 2)
    fs.writeFileSync(this.configParams.OUTPUT_FILE, deploymentStateJSON)

  }
  // --- Deployer methods ---

  async getFactory(name) {
    const factory = await ethers.getContractFactory(name, this.deployerWallet)
    return factory
  }

  async sendAndWaitForTransaction(txPromise) {
    const tx = await txPromise
    const minedTx = await ethers.provider.waitForTransaction(tx.hash, this.configParams.TX_CONFIRMATIONS)

    if (!minedTx.status) {
      throw ('Transaction Failed', txPromise);
    }

    return minedTx
  }

  async loadOrDeploy(factory, name, deploymentState, proxy, params = []) {

    if (deploymentState[name] && deploymentState[name].address) {
      console.log(`Using previously deployed ${name} contract at address ${deploymentState[name].address}`)
      return await factory.attach(deploymentState[name].address);
    }

    const contract = proxy
      ? await upgrades.deployProxy(factory)
      : await factory.deploy(...params, { gasPrice: this.configParams.GAS_PRICE });

    await this.deployerWallet.provider.waitForTransaction(contract.deployTransaction.hash, this.configParams.TX_CONFIRMATIONS)

    deploymentState[name] = {
      address: contract.address,
      txHash: contract.deployTransaction.hash
    }

    this.saveDeployment(deploymentState)

    return contract
  }


  async deployMockERC20Contract(deploymentState, name, decimals = 18) {
    const ERC20MockFactory = await this.getFactory("ERC20Mock")
    const erc20Mock = await this.loadOrDeploy(ERC20MockFactory, name, deploymentState, false, [name, name, decimals])

    await erc20Mock.mint(this.deployerWallet.address, "100000".concat("0".repeat(decimals)));
    
    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract(name, deploymentState, [name, name, decimals])
    }

    return erc20Mock.address
  }

  async deployPSYToken(treasurySigAddress, deploymentState) {
    const PSYTokenFactory = await this.getFactory("PSYToken")

    const PSYToken = await this.loadOrDeploy(
      PSYTokenFactory,
      'PSYToken',
      deploymentState,
      false,
      [treasurySigAddress]
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('PSYToken', deploymentState, [treasurySigAddress])
    }

    return PSYToken;
  }

  async deployPartially(treasurySigAddress, deploymentState) {
    const PSYTokenFactory = await this.getFactory("PSYToken")
    const lockedPSYFactory = await this.getFactory("LockedPSY")

    const lockedPSY = await this.loadOrDeploy(lockedPSYFactory, 'lockedPSY', deploymentState)

    // Deploy PSY Token, passing Community Issuance and Factory addresses to the constructor
    const PSYToken = await this.loadOrDeploy(
      PSYTokenFactory,
      'PSYToken',
      deploymentState,
      false,
      [treasurySigAddress]
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('lockedPSY', deploymentState, [])
      await this.verifyContract('PSYToken', deploymentState, [treasurySigAddress])
    }

    await this.isOwnershipRenounced(lockedPSY) ||
      await this.sendAndWaitForTransaction(lockedPSY.setAddresses(
        PSYToken.address,
        { gasPrice: this.configParams.GAS_PRICE }
      ))

    const partialContracts = {
      lockedPSY,
      PSYToken
    }

    return partialContracts
  }


  async deployslsdCoreMainnet(deploymentState, multisig) {
    // Get contract factories
    const priceFeedFactory = await this.getFactory("PriceFeedTestnet")
    const sortedTrovesFactory = await this.getFactory("SortedTroves")
    const troveManagerFactory = await this.getFactory("TroveManager")
    const troveManagerHelpersFactory = await this.getFactory("TroveManagerHelpers")
    const activePoolFactory = await this.getFactory("ActivePool")
    const StabilityPoolManagerFactory = await this.getFactory("StabilityPoolManager")
    const gasPoolFactory = await this.getFactory("GasPool")
    const defaultPoolFactory = await this.getFactory("DefaultPool")
    const collSurplusPoolFactory = await this.getFactory("CollSurplusPool")
    const borrowerOperationsFactory = await this.getFactory("BorrowerOperations")
    const hintHelpersFactory = await this.getFactory("HintHelpers")
    const SLSDTokenFactory = await this.getFactory("SLSDToken")
    const vaultParametersFactory = await this.getFactory("PSYParameters")
    const adminContractFactory = await this.getFactory("AdminContract")

    //// USE PROXY

    //// NO PROXY
    const gasPool = await this.loadOrDeploy(gasPoolFactory, 'gasPool', deploymentState)
    const sortedTroves = await this.loadOrDeploy(sortedTrovesFactory, 'sortedTroves', deploymentState)
    const troveManager = await this.loadOrDeploy(troveManagerFactory, 'troveManager', deploymentState)
    const troveManagerHelpers = await this.loadOrDeploy(troveManagerHelpersFactory, 'troveManagerHelpers', deploymentState)
    const activePool = await this.loadOrDeploy(activePoolFactory, 'activePool', deploymentState)
    const stabilityPoolManager = await this.loadOrDeploy(StabilityPoolManagerFactory, 'stabilityPoolManager', deploymentState)
    const defaultPool = await this.loadOrDeploy(defaultPoolFactory, 'defaultPool', deploymentState)
    const collSurplusPool = await this.loadOrDeploy(collSurplusPoolFactory, 'collSurplusPool', deploymentState)
    const borrowerOperations = await this.loadOrDeploy(borrowerOperationsFactory, 'borrowerOperations', deploymentState)
    const hintHelpers = await this.loadOrDeploy(hintHelpersFactory, 'hintHelpers', deploymentState)
    const psyParameters = await this.loadOrDeploy(vaultParametersFactory, 'psyParameters', deploymentState)
    const priceFeed = await this.loadOrDeploy(priceFeedFactory, 'priceFeed', deploymentState)
    const adminContract = await this.loadOrDeploy(adminContractFactory, 'adminContract', deploymentState)




    const SLSDTokenParams = [
      stabilityPoolManager.address
    ]
    const slsdToken = await this.loadOrDeploy(
      SLSDTokenFactory,
      'SLSDToken',
      deploymentState,
      false,
      SLSDTokenParams
    )
    // add borrower operations and trove manager to slsd
    if (!(await slsdToken.validTroveManagers(troveManager.address))) {
      await this.sendAndWaitForTransaction(slsdToken.addTroveManager(troveManager.address));
    }
    if (!(await slsdToken.validBorrowerOps(borrowerOperations.address))) {
      await this.sendAndWaitForTransaction(slsdToken.addBorrowerOps(borrowerOperations.address));
    }

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      console.log('verifing')
      await this.verifyContract('priceFeed', deploymentState, [], false)
      await this.verifyContract('sortedTroves', deploymentState, [], false)
      await this.verifyContract('troveManager', deploymentState, [], false)
      await this.verifyContract('troveManagerHelpers', deploymentState, [], false)
      await this.verifyContract('activePool', deploymentState, [], false)
      await this.verifyContract('stabilityPoolManager', deploymentState, [], false)
      await this.verifyContract('gasPool', deploymentState, [], false)
      await this.verifyContract('defaultPool', deploymentState, [], false)
      await this.verifyContract('collSurplusPool', deploymentState, [], false)
      await this.verifyContract('borrowerOperations', deploymentState, [], false)
      await this.verifyContract('hintHelpers', deploymentState, [], false)
      await this.verifyContract('SLSDToken', deploymentState, SLSDTokenParams)
      await this.verifyContract('psyParameters', deploymentState, [], false)
      await this.verifyContract('adminContract', deploymentState, [], false)
    }
    console.log('verified on etherscan')

    const coreContracts = {
      priceFeed,
      slsdToken,
      sortedTroves,
      troveManager,
      troveManagerHelpers,
      activePool,
      stabilityPoolManager,
      adminContract,
      gasPool,
      defaultPool,
      collSurplusPool,
      borrowerOperations,
      hintHelpers,
      psyParameters
    }


    return coreContracts
  }

  async deployPSYContractsMainnet(treasurySigAddress, deploymentState) {
    const PSYStakingFactory = await this.getFactory("PSYStaking")
    const communityIssuanceFactory = await this.getFactory("CommunityIssuance")
    const PSYTokenFactory = await this.getFactory("PSYToken")

    const PSYStaking = await this.loadOrDeploy(PSYStakingFactory, 'PSYStaking', deploymentState)
    const communityIssuance = await this.loadOrDeploy(communityIssuanceFactory, 'communityIssuance', deploymentState)

    // Deploy PSY Token, passing Community Issuance and Factory addresses to the constructor
    const PSYToken = await this.loadOrDeploy(
      PSYTokenFactory,
      'PSYToken',
      deploymentState,
      false,
      [treasurySigAddress]
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('PSYStaking', deploymentState)
      await this.verifyContract('communityIssuance', deploymentState)
      await this.verifyContract('PSYToken', deploymentState, [treasurySigAddress])
    }

    const PSYContracts = {
      PSYStaking,
      communityIssuance,
      PSYToken
    }
    return PSYContracts
  }

  async deployMultiTroveGetterMainnet(slsdCore, deploymentState) {
    const multiTroveGetterFactory = await this.getFactory("MultiTroveGetter")
    const multiTroveGetterParams = [
      slsdCore.troveManager.address,
      slsdCore.troveManagerHelpers.address,
      slsdCore.sortedTroves.address
    ]
    const multiTroveGetter = await this.loadOrDeploy(
      multiTroveGetterFactory,
      'multiTroveGetter',
      deploymentState,
      false,
      multiTroveGetterParams
    )

    if (!this.configParams.ETHERSCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('multiTroveGetter', deploymentState, multiTroveGetterParams)
    }

    return multiTroveGetter
  }
  // --- Connector methods ---

  async isOwnershipRenounced(contract) {
    const isInitialized = await contract.isInitialized();
    console.log("%s Is Initalized : %s", await contract.NAME(), isInitialized);
    return isInitialized;
  }
  // Connect contracts to their dependencies
  async connectCoreContractsMainnet(contracts, PSYContracts) {

    const gasPrice = this.configParams.GAS_PRICE
    const treasuryAddress = this.configParams.treasuryAddress

    await this.isOwnershipRenounced(contracts.priceFeed) ||
      await this.sendAndWaitForTransaction(contracts.priceFeed.setAddresses(
        contracts.adminContract.address,
        { gasPrice }))

    await this.isOwnershipRenounced(contracts.sortedTroves) ||
      await this.sendAndWaitForTransaction(contracts.sortedTroves.setParams(
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.borrowerOperations.address,
        { gasPrice }
      ))
    await this.isOwnershipRenounced(contracts.psyParameters) ||
      await this.sendAndWaitForTransaction(contracts.psyParameters.setAddresses(
        contracts.activePool.address,
        contracts.defaultPool.address,
        contracts.priceFeed.address,
        contracts.adminContract.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.troveManager) ||
      await this.sendAndWaitForTransaction(contracts.troveManager.setAddresses(
        contracts.stabilityPoolManager.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.slsdToken.address,
        contracts.sortedTroves.address,
        PSYContracts.PSYStaking.address,
        treasuryAddress,
        contracts.psyParameters.address,
        contracts.troveManagerHelpers.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.troveManagerHelpers) ||
      await this.sendAndWaitForTransaction(contracts.troveManagerHelpers.setAddresses(
        contracts.borrowerOperations.address,
        contracts.slsdToken.address,
        contracts.sortedTroves.address,
        contracts.psyParameters.address,
        contracts.troveManager.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.borrowerOperations) ||
      await this.sendAndWaitForTransaction(contracts.borrowerOperations.setAddresses(
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.stabilityPoolManager.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.sortedTroves.address,
        contracts.slsdToken.address,
        PSYContracts.PSYStaking.address,
        treasuryAddress,
        contracts.psyParameters.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.stabilityPoolManager) ||
      await this.sendAndWaitForTransaction(contracts.stabilityPoolManager.setAddresses(
        contracts.adminContract.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.activePool) ||
      await this.sendAndWaitForTransaction(contracts.activePool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.stabilityPoolManager.address,
        contracts.defaultPool.address,
        contracts.collSurplusPool.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.defaultPool) ||
      await this.sendAndWaitForTransaction(contracts.defaultPool.setAddresses(
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.activePool.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.collSurplusPool) ||
      await this.sendAndWaitForTransaction(contracts.collSurplusPool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.activePool.address,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(contracts.adminContract) ||
      await this.sendAndWaitForTransaction(contracts.adminContract.setAddresses(
        contracts.psyParameters.address,
        contracts.stabilityPoolManager.address,
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.slsdToken.address,
        contracts.sortedTroves.address,
        PSYContracts.communityIssuance.address,
        { gasPrice }
      ))

    // set contracts in HintHelpers
    await this.isOwnershipRenounced(contracts.hintHelpers) ||
      await this.sendAndWaitForTransaction(contracts.hintHelpers.setAddresses(
        contracts.sortedTroves.address,
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.psyParameters.address,
        { gasPrice }
      ))
  }

  async connectPSYContractsToCoreMainnet(PSYContracts, coreContracts, treasuryAddress) {
    const gasPrice = this.configParams.GAS_PRICE
    await this.isOwnershipRenounced(PSYContracts.PSYStaking) ||
      await this.sendAndWaitForTransaction(PSYContracts.PSYStaking.setAddresses(
        PSYContracts.PSYToken.address,
        coreContracts.slsdToken.address,
        coreContracts.troveManager.address,
        coreContracts.troveManagerHelpers.address,
        coreContracts.borrowerOperations.address,
        coreContracts.activePool.address,
        treasuryAddress,
        { gasPrice }
      ))

    await this.isOwnershipRenounced(PSYContracts.communityIssuance) ||
      await this.sendAndWaitForTransaction(PSYContracts.communityIssuance.setAddresses(
        PSYContracts.PSYToken.address,
        coreContracts.stabilityPoolManager.address,
        coreContracts.adminContract.address,
        { gasPrice }
      ))
  }

  // --- Verify on Ethrescan ---
  async verifyContract(name, deploymentState, constructorArguments = [], proxy = false) {
    
    if (!deploymentState[name] || !deploymentState[name].address) {
      console.error(`  --> No deployment state for contract ${name}!!`)
      return
    }
    if (deploymentState[name].verification && deploymentState[name].verificationImplementation) {
      console.log(`Contract ${name} already verified`)
      return
    }

    if (!deploymentState[name].verification) {
      try {
        await this.hre.run("verify:verify", {
          address: deploymentState[name].address,
          constructorArguments,
        })
      } catch (error) {
        // if it was already verified, it’s like a success, so let’s move forward and save it
        if (error.name != 'NomicLabsHardhatPluginError') {
          console.error(`Error verifying: ${error.name}`)
          console.error(error)
          return
        }
      }

      deploymentState[name].verification = `${this.configParams.ETHERSCAN_BASE_URL}/${deploymentState[name].address}#code`
    }

    if (proxy && !deploymentState[name].verificationImplementation) {
      const implementationAddress = await upgrades.erc1967.getImplementationAddress(deploymentState[name].address);
      try {
        await this.hre.run("verify:verify", {
          address: implementationAddress,
          constructorArguments: [],
        })
      } catch (error) {
        // if it was already verified, it’s like a success, so let’s move forward and save it
        if (error.name != 'NomicLabsHardhatPluginError') {
          console.error(`Error verifying: ${error.name}`)
          console.error(error)
          return
        }
      }

      deploymentState[name].verificationImplementation = `${this.configParams.ETHERSCAN_BASE_URL}/${implementationAddress}#code`

    }

    this.saveDeployment(deploymentState)
  }

  // --- Helpers ---

  async logContractObjects(contracts) {
    console.log(`Contract objects addresses:`)
    for (const contractName of Object.keys(contracts)) {
      console.log(`${contractName}: ${contracts[contractName].address}`);
    }
  }
}

module.exports = DeploymentHelper
