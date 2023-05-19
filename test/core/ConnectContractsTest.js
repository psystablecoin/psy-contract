const deploymentHelper = require('../utils/deploymentHelpers.js')
const StabilityPool = artifacts.require('StabilityPool.sol')
const testHelpers = require('../utils/testHelpers.js')

const th = testHelpers.TestHelper

contract(
  'Deployment script - Sets correct contract addresses dependencies after deployment',
  async (accounts) => {
    const [owner] = accounts
    const ZERO_ADDRESS = th.ZERO_ADDRESS

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

    let priceFeed
    let slsdToken
    let sortedTroves
    let troveManager
    let troveManagerHelpers
    let activePool
    let stabilityPool
    let stabilityPoolManager
    let defaultPool
    let borrowerOperations
    let psyStaking
    let psyToken
    let communityIssuance
    let psyParameters

    before(async () => {
      const coreContracts = await deploymentHelper.deployLiquityCore()
      const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(accounts[0])

      priceFeed = coreContracts.priceFeedTestnet
      slsdToken = coreContracts.slsdToken
      sortedTroves = coreContracts.sortedTroves
      troveManager = coreContracts.troveManager
      troveManagerHelpers = coreContracts.troveManagerHelpers
      activePool = coreContracts.activePool
      stabilityPoolManager = coreContracts.stabilityPoolManager
      defaultPool = coreContracts.defaultPool
      borrowerOperations = coreContracts.borrowerOperations
      psyParameters = coreContracts.psyParameters

      psyStaking = PSYContracts.psyStaking
      psyToken = PSYContracts.psyToken
      communityIssuance = PSYContracts.communityIssuance

      await deploymentHelper.connectCoreContracts(coreContracts, PSYContracts)
      await deploymentHelper.connectPSYContractsToCore(PSYContracts, coreContracts)
      stabilityPool = await StabilityPool.at(
        await coreContracts.stabilityPoolManager.getAssetStabilityPool(ZERO_ADDRESS)
      )
    })

    it('Check if correct Addresses in Vault Parameters', async () => {
      assert.equal(priceFeed.address, await psyParameters.priceFeed())
      assert.equal(activePool.address, await psyParameters.activePool())
      assert.equal(defaultPool.address, await psyParameters.defaultPool())
    })

    it('Sets the correct psyParams address in TroveManager', async () => {
      assert.equal(psyParameters.address, await troveManager.psyParams())
    })

    it('Sets the correct SLSDToken address in TroveManager', async () => {
      const SLSDTokenAddress = slsdToken.address

      const recordedClvTokenAddress = await troveManager.slsdToken()

      assert.equal(SLSDTokenAddress, recordedClvTokenAddress)
    })

    it('Sets the correct SortedTroves address in TroveManager', async () => {
      const sortedTrovesAddress = sortedTroves.address

      const recordedSortedTrovesAddress = await troveManager.sortedTroves()

      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress)
    })

    it('Sets the correct BorrowerOperations address in TroveManager', async () => {
      const borrowerOperationsAddress = borrowerOperations.address

      const recordedBorrowerOperationsAddress = await troveManagerHelpers.borrowerOperationsAddress()

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
    })

    it('Sets the correct StabilityPool address in TroveManager', async () => {
      assert.equal(stabilityPoolManager.address, await troveManager.stabilityPoolManager())
    })

    it('Sets the correct PSYStaking address in TroveManager', async () => {
      const PSYStakingAddress = psyStaking.address

      const recordedPSYStakingAddress = await troveManager.psyStaking()
      assert.equal(PSYStakingAddress, recordedPSYStakingAddress)
    })

    // Active Pool
    it('Sets the correct StabilityPool address in ActivePool', async () => {
      assert.equal(stabilityPoolManager.address, await activePool.stabilityPoolManager())
    })

    it('Sets the correct DefaultPool address in ActivePool', async () => {
      const defaultPoolAddress = defaultPool.address

      const recordedDefaultPoolAddress = await activePool.defaultPool()

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress)
    })

    it('Sets the correct BorrowerOperations address in ActivePool', async () => {
      const borrowerOperationsAddress = borrowerOperations.address

      const recordedBorrowerOperationsAddress = await activePool.borrowerOperationsAddress()

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
    })

    it('Sets the correct TroveManager address in ActivePool', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await activePool.troveManagerAddress()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    // Stability Pool
    it('Sets the correct BorrowerOperations address in StabilityPool', async () => {
      const borrowerOperationsAddress = borrowerOperations.address

      const recordedBorrowerOperationsAddress = await stabilityPool.borrowerOperations()

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
    })

    it('Sets the correct SLSDToken address in StabilityPool', async () => {
      const SLSDTokenAddress = slsdToken.address

      const recordedClvTokenAddress = await stabilityPool.slsdToken()

      assert.equal(SLSDTokenAddress, recordedClvTokenAddress)
    })

    it('Sets the correct TroveManager address in StabilityPool', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await stabilityPool.troveManager()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    // Default Pool

    it('Sets the correct TroveManager address in DefaultPool', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await defaultPool.troveManagerAddress()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    it('Sets the correct ActivePool address in DefaultPool', async () => {
      const activePoolAddress = activePool.address

      const recordedActivePoolAddress = await defaultPool.activePoolAddress()
      assert.equal(activePoolAddress, recordedActivePoolAddress)
    })

    it('Sets the correct TroveManager address in SortedTroves', async () => {
      const borrowerOperationsAddress = borrowerOperations.address

      const recordedBorrowerOperationsAddress = await sortedTroves.borrowerOperationsAddress()
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
    })

    it('Sets the correct BorrowerOperations address in SortedTroves', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await sortedTroves.troveManager()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    //--- BorrowerOperations ---

    it('Sets the correct PSYParameters address in BorrowerOperations', async () => {
      assert.equal(psyParameters.address, await borrowerOperations.psyParams())
    })

    // TroveManager in BO
    it('Sets the correct TroveManager address in BorrowerOperations', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await borrowerOperations.troveManager()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    // setSortedTroves in BO
    it('Sets the correct SortedTroves address in BorrowerOperations', async () => {
      const sortedTrovesAddress = sortedTroves.address

      const recordedSortedTrovesAddress = await borrowerOperations.sortedTroves()
      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress)
    })

    // PSY Staking in BO
    it('Sets the correct PSYStaking address in BorrowerOperations', async () => {
      const PSYStakingAddress = psyStaking.address

      const recordedPSYStakingAddress = await borrowerOperations.PSYStakingAddress()
      assert.equal(PSYStakingAddress, recordedPSYStakingAddress)
    })

    // --- PSY Staking ---

    // Sets PSYToken in PSYStaking
    it('Sets the correct PSYToken address in PSYStaking', async () => {
      const PSYTokenAddress = psyToken.address

      const recordedPSYTokenAddress = await psyStaking.psyToken()
      assert.equal(PSYTokenAddress, recordedPSYTokenAddress)
    })

    // Sets ActivePool in PSYStaking
    it('Sets the correct ActivePool address in PSYStaking', async () => {
      const activePoolAddress = activePool.address

      const recordedActivePoolAddress = await psyStaking.activePoolAddress()
      assert.equal(activePoolAddress, recordedActivePoolAddress)
    })

    // Sets SLSDToken in PSYStaking
    it('Sets the correct ActivePool address in PSYStaking', async () => {
      const SLSDTokenAddress = slsdToken.address

      const recordedSLSDTokenAddress = await psyStaking.slsdToken()
      assert.equal(SLSDTokenAddress, recordedSLSDTokenAddress)
    })

    // Sets TroveManager in PSYStaking
    it('Sets the correct ActivePool address in PSYStaking', async () => {
      const troveManagerAddress = troveManager.address

      const recordedTroveManagerAddress = await psyStaking.troveManagerAddress()
      assert.equal(troveManagerAddress, recordedTroveManagerAddress)
    })

    // Sets BorrowerOperations in PSYStaking
    it('Sets the correct BorrowerOperations address in PSYStaking', async () => {
      const borrowerOperationsAddress = borrowerOperations.address

      const recordedBorrowerOperationsAddress = await psyStaking.borrowerOperationsAddress()
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
    })

    // ---  PSYToken ---

    // --- CI ---
    // Sets PSYToken in CommunityIssuance
    it('Sets the correct PSYToken address in CommunityIssuance', async () => {
      const PSYTokenAddress = psyToken.address

      const recordedPSYTokenAddress = await communityIssuance.psyToken()
      assert.equal(PSYTokenAddress, recordedPSYTokenAddress)
    })

    it('Sets the correct StabilityPool address in CommunityIssuance', async () => {
      assert.equal(stabilityPoolManager.address, await communityIssuance.stabilityPoolManager())
    })
  }
)
