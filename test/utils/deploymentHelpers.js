const SortedTroves = artifacts.require('./SortedTroves.sol')
const TroveManager = artifacts.require('./TroveManager.sol')
const TroveManagerHelpers = artifacts.require('./TroveManagerHelpers.sol')
const PriceFeedTestnet = artifacts.require('./PriceFeedTestnet.sol')
const SLSDToken = artifacts.require('./SLSDToken.sol')
const ActivePool = artifacts.require('./ActivePool.sol')
const DefaultPool = artifacts.require('./DefaultPool.sol')
const StabilityPool = artifacts.require('./StabilityPool.sol')
const StabilityPoolManager = artifacts.require('./StabilityPoolManager.sol')
const AdminContract = artifacts.require('./AdminContract.sol')
const GasPool = artifacts.require('./GasPool.sol')
const CollSurplusPool = artifacts.require('./CollSurplusPool.sol')
const BorrowerOperations = artifacts.require('./BorrowerOperations.sol')
const HintHelpers = artifacts.require('./HintHelpers.sol')
const PSYParameters = artifacts.require('./PSYParameters.sol')
const LockedPSY = artifacts.require('./LockedPSY.sol')

const PSYStaking = artifacts.require('./PSYStaking.sol')
const CommunityIssuance = artifacts.require('./CommunityIssuance.sol')

const PSYTokenTester = artifacts.require('./PSYTokenTester.sol')
const CommunityIssuanceTester = artifacts.require('./CommunityIssuanceTester.sol')
const StabilityPoolTester = artifacts.require('./StabilityPoolTester.sol')
const ActivePoolTester = artifacts.require('./ActivePoolTester.sol')
const DefaultPoolTester = artifacts.require('./DefaultPoolTester.sol')
const BorrowerOperationsTester = artifacts.require('./BorrowerOperationsTester.sol')
const TroveManagerTester = artifacts.require('./TroveManagerTester.sol')
const TroveManagerHelpersTester = artifacts.require('./TroveManagerHelpersTester.sol')
const SLSDTokenTester = artifacts.require('./SLSDTokenTester.sol')
const ERC20Test = artifacts.require('./ERC20Test.sol')

/* "Liquity core" consists of all contracts in the core Liquity system.

PSY contracts consist of only those contracts related to the PSY Token:

-the PSY token
-the Lockup factory and lockup contracts
-the PSYStaking contract
-the CommunityIssuance contract 
*/

const testHelpers = require('./testHelpers.js')

const th = testHelpers.TestHelper
const dec = th.dec

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)

class DeploymentHelper {
  static async deployLiquityCore() {
    return this.deployLiquityCoreHardhat()
  }

  static async deployLiquityCoreHardhat() {
    const priceFeedTestnet = await PriceFeedTestnet.new()
    const sortedTroves = await SortedTroves.new()
    const troveManager = await TroveManager.new()
    const troveManagerHelpers = await TroveManagerHelpers.new()
    const activePool = await ActivePool.new()
    const stabilityPoolTemplate = await StabilityPool.new()
    const stabilityPoolTemplateV2 = await StabilityPool.new()
    const stabilityPoolManager = await StabilityPoolManager.new()
    const psyParameters = await PSYParameters.new()
    const gasPool = await GasPool.new()
    const defaultPool = await DefaultPool.new()
    const collSurplusPool = await CollSurplusPool.new()
    const borrowerOperations = await BorrowerOperations.new()
    const hintHelpers = await HintHelpers.new()
    const slsdToken = await SLSDToken.new(stabilityPoolManager.address)
    const erc20 = await ERC20Test.new()
    const adminContract = await AdminContract.new()

    SLSDToken.setAsDeployed(slsdToken)
    DefaultPool.setAsDeployed(defaultPool)
    PriceFeedTestnet.setAsDeployed(priceFeedTestnet)
    SortedTroves.setAsDeployed(sortedTroves)
    TroveManager.setAsDeployed(troveManager)
    TroveManagerHelpers.setAsDeployed(troveManagerHelpers)
    ActivePool.setAsDeployed(activePool)
    StabilityPool.setAsDeployed(stabilityPoolTemplate)
    StabilityPool.setAsDeployed(stabilityPoolTemplateV2)
    GasPool.setAsDeployed(gasPool)
    CollSurplusPool.setAsDeployed(collSurplusPool)
    BorrowerOperations.setAsDeployed(borrowerOperations)
    HintHelpers.setAsDeployed(hintHelpers)
    PSYParameters.setAsDeployed(psyParameters)
    ERC20Test.setAsDeployed(erc20)
    AdminContract.setAsDeployed(adminContract)

    await erc20.setDecimals(8)

    const coreContracts = {
      priceFeedTestnet,
      slsdToken,
      sortedTroves,
      troveManager,
      troveManagerHelpers,
      activePool,
      stabilityPoolTemplate,
      stabilityPoolTemplateV2,
      stabilityPoolManager,
      psyParameters,
      gasPool,
      defaultPool,
      collSurplusPool,
      borrowerOperations,
      hintHelpers,
      erc20,
      adminContract,
    }
    return coreContracts
  }

  // This is for the SLSD test
  static async deployTesterContractsHardhat() {
    const testerContracts = {}

    // Contract without testers (yet)
    testerContracts.erc20 = await ERC20Test.new()
    testerContracts.priceFeedTestnet = await PriceFeedTestnet.new()
    testerContracts.sortedTroves = await SortedTroves.new()
    // Actual tester contracts
    testerContracts.communityIssuance = await CommunityIssuanceTester.new()
    testerContracts.activePool = await ActivePoolTester.new()
    testerContracts.defaultPool = await DefaultPoolTester.new()
    testerContracts.stabilityPoolTemplate = await StabilityPoolTester.new()
    testerContracts.stabilityPoolTemplateV2 = await StabilityPoolTester.new()
    testerContracts.stabilityPoolManager = await StabilityPoolManager.new()
    testerContracts.psyParameters = await PSYParameters.new()
    testerContracts.gasPool = await GasPool.new()
    testerContracts.collSurplusPool = await CollSurplusPool.new()
    testerContracts.borrowerOperations = await BorrowerOperationsTester.new()
    testerContracts.troveManager = await TroveManagerTester.new()
    testerContracts.troveManagerHelpers = await TroveManagerHelpersTester.new()
    testerContracts.hintHelpers = await HintHelpers.new()
    testerContracts.slsdToken = await SLSDTokenTester.new(testerContracts.stabilityPoolManager.address)
    testerContracts.adminContract = await AdminContract.new()

    return testerContracts
  }

  static async deployPSYContractsHardhat(treasury) {
    const psyStaking = await PSYStaking.new()
    const communityIssuance = await CommunityIssuanceTester.new()
    const lockedPSY = await LockedPSY.new()

    PSYStaking.setAsDeployed(psyStaking)
    CommunityIssuanceTester.setAsDeployed(communityIssuance)
    LockedPSY.setAsDeployed(lockedPSY)

    // Deploy PSY Token, passing Community Issuance and Factory addresses to the constructor
    const psyToken = await PSYTokenTester.new(treasury)
    PSYTokenTester.setAsDeployed(psyToken)

    const PSYContracts = {
      psyStaking,
      communityIssuance,
      psyToken,
      lockedPSY,
    }
    return PSYContracts
  }

  static async deploySLSDToken(contracts) {
    contracts.slsdToken = await SLSDTokenTester.new(contracts.stabilityPoolManager.address)
    return contracts
  }
  
  static async connectContractsWithoutPSY(
    contracts,
    treasuryAddress
  ) {
    await contracts.slsdToken.addTroveManager(contracts.troveManager.address)
    await contracts.slsdToken.addBorrowerOps(contracts.borrowerOperations.address)

    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.setParams(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.borrowerOperations.address
    )

    await contracts.psyParameters.setAddresses(
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.priceFeedTestnet.address,
      contracts.adminContract.address
    )

    // set contracts in the Trove Manager
    await contracts.troveManager.setAddresses(
      contracts.stabilityPoolManager.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      ZERO_ADDRESS,
      treasuryAddress,
      contracts.psyParameters.address,
      contracts.troveManagerHelpers.address
    )

    // set contracts in the TroveManagerHelpers
    await contracts.troveManagerHelpers.setAddresses(
      contracts.borrowerOperations.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      contracts.psyParameters.address,
      contracts.troveManager.address
    )

    // set contracts in BorrowerOperations
    await contracts.borrowerOperations.setAddresses(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.stabilityPoolManager.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.sortedTroves.address,
      contracts.slsdToken.address,
      ZERO_ADDRESS,
      treasuryAddress,
      contracts.psyParameters.address
    )

    await contracts.stabilityPoolManager.setAddresses(contracts.adminContract.address)

    await contracts.adminContract.setAddresses(
      contracts.psyParameters.address,
      contracts.stabilityPoolManager.address,
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      ZERO_ADDRESS,
    )

    await contracts.activePool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.stabilityPoolManager.address,
      contracts.defaultPool.address,
      contracts.collSurplusPool.address
    )

    await contracts.defaultPool.setAddresses(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.activePool.address
    )

    await contracts.collSurplusPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.activePool.address
    )

    // set contracts in HintHelpers
    await contracts.hintHelpers.setAddresses(
      contracts.sortedTroves.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.psyParameters.address
    )

    // Set Liquity Configs (since the tests have been designed with it)
    await contracts.psyParameters.setCollateralParameters(
      ZERO_ADDRESS,
      '1100000000000000000',
      '1500000000000000000',
      dec(200, 18),
      dec(1800, 18),
      200,
      50,
      500,
      50
    )

    await contracts.psyParameters.setCollateralParameters(
      contracts.erc20.address,
      '1100000000000000000',
      '1500000000000000000',
      dec(200, 18),
      dec(1800, 18),
      200,
      50,
      500,
      50
    )

  }

  // Connect contracts to their dependencies
  static async connectCoreContracts(contracts, PSYContracts) {
    await contracts.slsdToken.addTroveManager(contracts.troveManager.address)
    await contracts.slsdToken.addBorrowerOps(contracts.borrowerOperations.address)

    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.setParams(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.borrowerOperations.address
    )

    await contracts.psyParameters.setAddresses(
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.priceFeedTestnet.address,
      contracts.adminContract.address
    )

    // set contracts in the Trove Manager
    await contracts.troveManager.setAddresses(
      contracts.stabilityPoolManager.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      PSYContracts.psyStaking.address,
      ZERO_ADDRESS,
      contracts.psyParameters.address,
      contracts.troveManagerHelpers.address
    )

    // set contracts in the TroveManagerHelpers
    await contracts.troveManagerHelpers.setAddresses(
      contracts.borrowerOperations.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      contracts.psyParameters.address,
      contracts.troveManager.address
    )

    // set contracts in BorrowerOperations
    await contracts.borrowerOperations.setAddresses(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.stabilityPoolManager.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.sortedTroves.address,
      contracts.slsdToken.address,
      PSYContracts.psyStaking.address,
      ZERO_ADDRESS,
      contracts.psyParameters.address
    )

    await contracts.stabilityPoolManager.setAddresses(contracts.adminContract.address)

    await contracts.adminContract.setAddresses(
      contracts.psyParameters.address,
      contracts.stabilityPoolManager.address,
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.slsdToken.address,
      contracts.sortedTroves.address,
      PSYContracts.communityIssuance.address
    )

    await contracts.activePool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.stabilityPoolManager.address,
      contracts.defaultPool.address,
      contracts.collSurplusPool.address
    )

    await contracts.defaultPool.setAddresses(
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.activePool.address
    )

    await contracts.collSurplusPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.activePool.address
    )

    // set contracts in HintHelpers
    await contracts.hintHelpers.setAddresses(
      contracts.sortedTroves.address,
      contracts.troveManager.address,
      contracts.troveManagerHelpers.address,
      contracts.psyParameters.address
    )
  }

  static async connectPSYContractsToCore(
    PSYContracts,
    coreContracts,
    skipPool = false,
    liquitySettings = true
  ) {
    const treasurySig = await PSYContracts.psyToken.treasury()

    await PSYContracts.psyStaking.setAddresses(
      PSYContracts.psyToken.address,
      coreContracts.slsdToken.address,
      coreContracts.troveManager.address,
      coreContracts.troveManagerHelpers.address,
      coreContracts.borrowerOperations.address,
      coreContracts.activePool.address,
      treasurySig
    )

    await PSYContracts.psyStaking.unpause()

    await PSYContracts.communityIssuance.setAddresses(
      PSYContracts.psyToken.address,
      coreContracts.stabilityPoolManager.address,
      coreContracts.adminContract.address
    )

    await PSYContracts.lockedPSY.setAddresses(PSYContracts.psyToken.address)
    
    await coreContracts.stabilityPoolTemplate.setAddresses(
      ZERO_ADDRESS,
      coreContracts.borrowerOperations.address,
      coreContracts.troveManager.address,
      coreContracts.troveManagerHelpers.address,
      coreContracts.slsdToken.address,
      coreContracts.sortedTroves.address,
      PSYContracts.communityIssuance.address,
      coreContracts.psyParameters.address
    )

    await coreContracts.stabilityPoolTemplateV2.setAddresses(
      coreContracts.erc20.address,
      coreContracts.borrowerOperations.address,
      coreContracts.troveManager.address,
      coreContracts.troveManagerHelpers.address,
      coreContracts.slsdToken.address,
      coreContracts.sortedTroves.address,
      PSYContracts.communityIssuance.address,
      coreContracts.psyParameters.address
    )
    
    if (skipPool) {
      return
    }

    if ((await coreContracts.adminContract.owner()) != treasurySig)
      await coreContracts.adminContract.transferOwnership(treasurySig)

    await PSYContracts.psyToken.approve(PSYContracts.communityIssuance.address, ethers.constants.MaxUint256, {
      from: treasurySig,
    })

    const supply = dec(32000000, 18)
    const weeklyReward = dec(32000000 / 4, 18) // 8M

    await coreContracts.adminContract.addNewCollateral(
      coreContracts.stabilityPoolTemplate.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      supply,
      weeklyReward,
      0,
      { from: treasurySig }
    )
    await PSYContracts.psyToken.unprotectedMint(treasurySig, supply)
    await coreContracts.adminContract.addNewCollateral(
      coreContracts.stabilityPoolTemplateV2.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      supply,
      weeklyReward,
      0,
      { from: treasurySig }
    )

    if (!liquitySettings) return

    // Set Liquity Configs (since the tests have been designed with it)
    await coreContracts.psyParameters.setCollateralParameters(
      ZERO_ADDRESS,
      '1100000000000000000',
      '1500000000000000000',
      dec(200, 18),
      dec(1800, 18),
      200,
      50,
      500,
      50
    )

    await coreContracts.psyParameters.setCollateralParameters(
      coreContracts.erc20.address,
      '1100000000000000000',
      '1500000000000000000',
      dec(200, 18),
      dec(1800, 18),
      200,
      50,
      500,
      50
    )
  }
}

module.exports = DeploymentHelper
