const deploymentHelper = require('../utils/deploymentHelpers.js')
const testHelpers = require('../utils/testHelpers.js')

const BorrowerOperationsTester = artifacts.require('./BorrowerOperationsTester.sol')
const NonPayable = artifacts.require('NonPayable.sol')
const TroveManagerTester = artifacts.require('TroveManagerTester')
const TroveManagerHelpersTester = artifacts.require('TroveManagerHelpersTester')
const FlashBorrower = artifacts.require('FlashBorrowerTest')

const th = testHelpers.TestHelper
const dec = th.dec
const toBN = th.toBN
const mv = testHelpers.MoneyValues
const timeValues = testHelpers.TimeValues

const ZERO_ADDRESS = th.ZERO_ADDRESS
const assertRevert = th.assertRevert

const MAX = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

/* NOTE: Some of the borrowing tests do not test for specific SLSD fee values. They only test that the
 * fees are non-zero when they should occur, and that they decay over time.
 *
 * Specific SLSD fee values will depend on the final fee schedule used, and the final choice for
 * the parameter MINUTE_DECAY_FACTOR in the TroveManager, which is still TBD based on economic
 * modelling.
 */

contract('BorrowerOperations', async (accounts) => {
  const [owner, alice, bob, carol, dennis, whale, A, B, C, D, E, F, G, H] = accounts

  const [multisig] = accounts.slice(997, 1000)

  let slsdToken
  let sortedTroves
  let troveManager
  let troveManagerHelpers
  let activePool
  let defaultPool
  let borrowerOperations
  let psyStaking
  let psyToken
  let psyParams
  let erc20

  let contracts

  const getOpenTroveSLSDAmount = async (totalDebt, asset) =>
    th.getOpenTroveSLSDAmount(contracts, totalDebt, asset)
  const getNetBorrowingAmount = async (debtWithFee, asset) =>
    th.getNetBorrowingAmount(contracts, debtWithFee, asset)
  const getActualDebtFromComposite = async (compositeDebt) =>
    th.getActualDebtFromComposite(compositeDebt, contracts)
  const openTrove = async (params) => th.openTrove(contracts, params)
  const getTroveEntireColl = async (trove, asset) => th.getTroveEntireColl(contracts, trove, asset)
  const getTroveEntireDebt = async (trove, asset) => th.getTroveEntireDebt(contracts, trove, asset)
  const getTroveStake = async (trove, asset) => th.getTroveStake(contracts, trove, asset)

  let SLSD_GAS_COMPENSATION
  let MIN_NET_DEBT
  let BORROWING_FEE_FLOOR
  let SLSD_GAS_COMPENSATION_ERC20
  let MIN_NET_DEBT_ERC20
  let BORROWING_FEE_FLOOR_ERC20

  before(async () => {})
  
  describe('Testing flashloan', async () => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployLiquityCore()
      contracts.borrowerOperations = await BorrowerOperationsTester.new()
      contracts.troveManager = await TroveManagerTester.new()
      contracts.troveManagerHelpers = await TroveManagerHelpersTester.new()
      contracts = await deploymentHelper.deploySLSDToken(contracts)
      const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(accounts[0])

      await deploymentHelper.connectCoreContracts(contracts, PSYContracts)
      await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts)
  
      slsdToken = contracts.slsdToken
      sortedTroves = contracts.sortedTroves
      troveManager = contracts.troveManager
      troveManagerHelpers = contracts.troveManagerHelpers
      activePool = contracts.activePool
      defaultPool = contracts.defaultPool
      borrowerOperations = contracts.borrowerOperations
      hintHelpers = contracts.hintHelpers
      psyParams = contracts.psyParameters

      psyStaking = PSYContracts.psyStaking
      psyToken = PSYContracts.psyToken
      communityIssuance = PSYContracts.communityIssuance
      erc20 = contracts.erc20

      await psyParams.sanitizeParameters(ZERO_ADDRESS)
      await psyParams.sanitizeParameters(erc20.address)
      
      borrower = await FlashBorrower.new(borrowerOperations.address)
    })

    it('reverts flasholan if the caller is unauthorized', async () => {
      await assertRevert(
        borrower.flashBorrow(slsdToken.address, 1, { from: alice }),
        'FlashLoan: Unauthorized caller'
      )
    })
    it('should do a simple flash loan', async () => {
      await borrowerOperations.changeFlashLoanerAddress(borrower.address);
      await borrower.flashBorrow(slsdToken.address, 1, { from: alice })
  
      let balanceAfter = await slsdToken.balanceOf(alice)
      assert.isTrue(balanceAfter.eq(toBN('0')))
      
      let flashBalance = await borrower.flashBalance()
      assert.isTrue(flashBalance.eq(toBN('1')))
      
      let flashToken = await borrower.flashToken()
      assert.equal(flashToken, slsdToken.address)
      
      let flashAmount = await borrower.flashAmount()
      assert.isTrue(flashAmount.eq(toBN('1')))
      
      let flashInitiator = await borrower.flashInitiator()
      assert.equal(flashInitiator, borrower.address)      
    })
    
  })
})


/* TODO:

 1) Test SortedList re-ordering by ICR. ICR ratio
 changes with addColl, withdrawColl, withdrawSLSD, withdrawSLSD, etc. Can split them up and put them with
 individual functions, or give ordering it's own 'describe' block.

 2)In security phase:
 -'Negative' tests for all the above functions.
 */
