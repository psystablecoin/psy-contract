const deploymentHelper = require('../utils/deploymentHelpers.js')
const testHelpers = require('../utils/testHelpers.js')
const TroveManagerTester = artifacts.require('./TroveManagerTester.sol')
const th = testHelpers.TestHelper
const dec = th.dec
const toBN = th.toBN

contract('PSYParameters', async (accounts) => {
  const ZERO_ADDRESS = th.ZERO_ADDRESS
  const assertRevert = th.assertRevert
  const DECIMAL_PRECISION = toBN(dec(1, 18))
  const [owner, user, A, C, B, multisig] = accounts

  let contracts
  let priceFeed
  let borrowerOperations
  let psyParameters
  let erc20

  let MCR
  let CCR
  let GAS_COMPENSATION
  let MIN_NET_DEBT
  let PERCENT_DIVISOR
  let BORROWING_FEE_FLOOR
  let MAX_BORROWING_FEE
  let REDEMPTION_FEE_FLOOR
  let DEBT_CEIL = dec("1000000000000000000000", 18)

  const MCR_SAFETY_MAX = toBN(dec(1000, 18)).div(toBN(100))
  const MCR_SAFETY_MIN = toBN(dec(101, 18)).div(toBN(100))

  const CCR_SAFETY_MAX = toBN(dec(1000, 18)).div(toBN(100))
  const CCR_SAFETY_MIN = toBN(dec(101, 18)).div(toBN(100))

  const PERCENT_DIVISOR_SAFETY_MAX = toBN(200)
  const PERCENT_DIVISOR_SAFETY_MIN = toBN(2)

  const BORROWING_FEE_FLOOR_SAFETY_MAX = toBN(1000) // max 10%
  const BORROWING_FEE_FLOOR_SAFETY_MIN = toBN(1)

  const MAX_BORROWING_FEE_SAFETY_MAX = toBN(1000) // max 10%
  const MAX_BORROWING_FEE_SAFETY_MIN = toBN(1)

  const SLSD_GAS_COMPENSATION_SAFETY_MAX = toBN(dec(200, 18))
  const SLSD_GAS_COMPENSATION_SAFETY_MIN = toBN(dec(1, 18))

  const MIN_NET_DEBT_SAFETY_MAX = toBN(dec(10000, 18))
  const MIN_NET_DEBT_SAFETY_MIN = toBN(1)

  const REDEMPTION_FEE_FLOOR_SAFETY_MAX = toBN(1000) // max 10%
  const REDEMPTION_FEE_FLOOR_SAFETY_MIN = toBN(10)

  const openTrove = async (params) => th.openTrove(contracts, params)

  function applyDecimalPrecision(value) {
    return DECIMAL_PRECISION.div(toBN(10000)).mul(toBN(value.toString()))
  }

  describe('PSY Parameters', async () => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployLiquityCore()
      contracts.troveManager = await TroveManagerTester.new()
      const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(accounts[0])

      priceFeed = contracts.priceFeedTestnet
      troveManager = contracts.troveManager
      activePool = contracts.activePool
      defaultPool = contracts.defaultPool
      borrowerOperations = contracts.borrowerOperations
      psyParameters = contracts.psyParameters
      erc20 = contracts.erc20

      MCR = await psyParameters.MCR_DEFAULT()
      CCR = await psyParameters.CCR_DEFAULT()
      GAS_COMPENSATION = await psyParameters.SLSD_GAS_COMPENSATION_DEFAULT()
      MIN_NET_DEBT = await psyParameters.MIN_NET_DEBT_DEFAULT()
      PERCENT_DIVISOR = await psyParameters.PERCENT_DIVISOR_DEFAULT()
      BORROWING_FEE_FLOOR = await psyParameters.BORROWING_FEE_FLOOR_DEFAULT()
      MAX_BORROWING_FEE = await psyParameters.MAX_BORROWING_FEE_DEFAULT()
      REDEMPTION_FEE_FLOOR = await psyParameters.REDEMPTION_FEE_FLOOR_DEFAULT()

      let index = 0
      for (const acc of accounts) {
        await erc20.mint(acc, await web3.eth.getBalance(acc))
        index++

        if (index >= 20) break
      }

      await deploymentHelper.connectCoreContracts(contracts, PSYContracts)
      await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts, false, false)
    })

    it('Formula Checks: Call every function with default value, Should match default values', async () => {
      await psyParameters.setMCR(ZERO_ADDRESS, '1100000000000000000')
      await psyParameters.setCCR(ZERO_ADDRESS, '1500000000000000000')
      await psyParameters.setPercentDivisor(ZERO_ADDRESS, 100)
      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, 50)
      await psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, 500)
      await psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, dec(20, 18))
      await psyParameters.setMinNetDebt(ZERO_ADDRESS, dec(2000, 18))
      await psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, 50)

      assert.equal((await psyParameters.MCR(ZERO_ADDRESS)).toString(), MCR)
      assert.equal((await psyParameters.CCR(ZERO_ADDRESS)).toString(), CCR)
      assert.equal((await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS)).toString(), PERCENT_DIVISOR)
      assert.equal((await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS)).toString(), BORROWING_FEE_FLOOR)
      assert.equal((await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS)).toString(), MAX_BORROWING_FEE.toString())
      assert.equal((await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS)).toString(), GAS_COMPENSATION.toString())
      assert.equal((await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS)).toString(), MIN_NET_DEBT)
      assert.equal(
        (await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS)).toString(),
        REDEMPTION_FEE_FLOOR
      )
    })

    it('Try to edit Parameters has User, Revert Transactions', async () => {
      await assertRevert(psyParameters.setPriceFeed(priceFeed.address, { from: user }))
      await assertRevert(psyParameters.setAsDefault(ZERO_ADDRESS, { from: user }))
      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL,
          { from: user }
        )
      )

      await assertRevert(psyParameters.setMCR(ZERO_ADDRESS, MCR, { from: user }))
      await assertRevert(psyParameters.setCCR(ZERO_ADDRESS, CCR, { from: user }))
      await assertRevert(
        psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, GAS_COMPENSATION, { from: user })
      )
      await assertRevert(psyParameters.setMinNetDebt(ZERO_ADDRESS, MIN_NET_DEBT, { from: user }))
      await assertRevert(psyParameters.setPercentDivisor(ZERO_ADDRESS, PERCENT_DIVISOR, { from: user }))
      await assertRevert(
        psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, BORROWING_FEE_FLOOR, { from: user })
      )
      await assertRevert(psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, MAX_BORROWING_FEE, { from: user }))
      await assertRevert(
        psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, REDEMPTION_FEE_FLOOR, { from: user })
      )
    })

    it('sanitizeParameters: User call sanitizeParameters on Non-Configured Collateral - Set Default Values', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS, { from: user })

      assert.equal(MCR.toString(), await psyParameters.MCR(ZERO_ADDRESS))
      assert.equal(CCR.toString(), await psyParameters.CCR(ZERO_ADDRESS))
      assert.equal(GAS_COMPENSATION.toString(), await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS))
      assert.equal(MIN_NET_DEBT.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))
      assert.equal(PERCENT_DIVISOR.toString(), await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS))
      assert.equal(BORROWING_FEE_FLOOR.toString(), await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS))
      assert.equal(MAX_BORROWING_FEE.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))
      assert.equal(REDEMPTION_FEE_FLOOR.toString(), await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS))
    })

    it('sanitizeParameters: User call sanitizeParameters on Configured Collateral - Ignore it', async () => {
      const newMCR = MCR_SAFETY_MAX
      const newCCR = CCR_SAFETY_MIN
      const newGasComp = SLSD_GAS_COMPENSATION_SAFETY_MAX
      const newMinNetDebt = MIN_NET_DEBT_SAFETY_MIN
      const newPercentDivisor = PERCENT_DIVISOR_SAFETY_MAX
      const newBorrowingFeeFloor = BORROWING_FEE_FLOOR_SAFETY_MIN
      const newMaxBorrowingFee = MAX_BORROWING_FEE_SAFETY_MAX // It is needed the MAX as we compare with the BORROWING_FEE_FLOOR
      const newRedemptionFeeFloor = REDEMPTION_FEE_FLOOR_SAFETY_MAX

      const expectedBorrowingFeeFloor = applyDecimalPrecision(newBorrowingFeeFloor)
      const expectedMaxBorrowingFee = applyDecimalPrecision(newMaxBorrowingFee)
      const expectedRedemptionFeeFloor = applyDecimalPrecision(newRedemptionFeeFloor)

      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, 1)

      await psyParameters.setCollateralParameters(
        ZERO_ADDRESS,
        newMCR,
        newCCR,
        newGasComp,
        newMinNetDebt,
        newPercentDivisor,
        newBorrowingFeeFloor,
        newMaxBorrowingFee,
        newRedemptionFeeFloor,
        DEBT_CEIL,
        { from: owner }
      )

      await psyParameters.sanitizeParameters(ZERO_ADDRESS, { from: user })

      assert.equal(newMCR.toString(), await psyParameters.MCR(ZERO_ADDRESS))
      assert.equal(newCCR.toString(), await psyParameters.CCR(ZERO_ADDRESS))
      assert.equal(newGasComp.toString(), await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS))
      assert.equal(newMinNetDebt.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))
      assert.equal(newPercentDivisor.toString(), await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS))
      assert.equal(
        expectedBorrowingFeeFloor.toString(),
        await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS)
      )
      assert.equal(expectedMaxBorrowingFee.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))
      assert.equal(
        expectedRedemptionFeeFloor.toString(),
        await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS)
      )
    })

    it('setPriceFeed: Owner change parameter - Failing SafeCheck', async () => {
      await assertRevert(psyParameters.setPriceFeed(ZERO_ADDRESS))
    })

    it('setPriceFeed: Owner change parameter - Valid Check', async () => {
      await psyParameters.setPriceFeed(priceFeed.address)
    })

    it('setMCR: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(psyParameters.setMCR(ZERO_ADDRESS, MCR_SAFETY_MIN.sub(toBN(1))))
      await assertRevert(psyParameters.setMCR(ZERO_ADDRESS, MCR_SAFETY_MAX.add(toBN(1))))
    })

    it('setMCR: Owner change parameter - Valid SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setMCR(ZERO_ADDRESS, MCR_SAFETY_MIN)
      assert.equal(MCR_SAFETY_MIN.toString(), await psyParameters.MCR(ZERO_ADDRESS))

      await psyParameters.setMCR(ZERO_ADDRESS, MCR_SAFETY_MAX)
      assert.equal(MCR_SAFETY_MAX.toString(), await psyParameters.MCR(ZERO_ADDRESS))
    })

    it('setCCR: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(psyParameters.setCCR(ZERO_ADDRESS, CCR_SAFETY_MIN.sub(toBN(1))))
      await assertRevert(psyParameters.setCCR(ZERO_ADDRESS, CCR_SAFETY_MAX.add(toBN(1))))
    })

    it('setCCR: Owner change parameter - Valid SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setCCR(ZERO_ADDRESS, CCR_SAFETY_MIN)
      assert.equal(CCR_SAFETY_MIN.toString(), await psyParameters.CCR(ZERO_ADDRESS))

      await psyParameters.setCCR(ZERO_ADDRESS, CCR_SAFETY_MAX)
      assert.equal(CCR_SAFETY_MAX.toString(), await psyParameters.CCR(ZERO_ADDRESS))
    })

    it('setSLSDGasCompensation: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(
        psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, SLSD_GAS_COMPENSATION_SAFETY_MIN.sub(toBN(1)))
      )
      await assertRevert(
        psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, SLSD_GAS_COMPENSATION_SAFETY_MAX.add(toBN(1)))
      )
    })

    it('setSLSDGasCompensation: Owner change parameter - Valid SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, SLSD_GAS_COMPENSATION_SAFETY_MIN)
      assert.equal(
        SLSD_GAS_COMPENSATION_SAFETY_MIN.toString(),
        await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS)
      )

      await psyParameters.setSLSDGasCompensation(ZERO_ADDRESS, SLSD_GAS_COMPENSATION_SAFETY_MAX)
      assert.equal(
        SLSD_GAS_COMPENSATION_SAFETY_MAX.toString(),
        await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS)
      )
    })

    it('setMinNetDebt: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)
      await assertRevert(psyParameters.setMinNetDebt(ZERO_ADDRESS, MIN_NET_DEBT_SAFETY_MAX.add(toBN(1))))
    })

    it('setMinNetDebt: Owner change parameter - Valid SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setMinNetDebt(ZERO_ADDRESS, MIN_NET_DEBT_SAFETY_MIN)
      assert.equal(MIN_NET_DEBT_SAFETY_MIN.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))

      await psyParameters.setMinNetDebt(ZERO_ADDRESS, MIN_NET_DEBT_SAFETY_MAX)
      assert.equal(MIN_NET_DEBT_SAFETY_MAX.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))
    })

    it('setPercentDivisor: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(
        psyParameters.setPercentDivisor(ZERO_ADDRESS, PERCENT_DIVISOR_SAFETY_MIN.sub(toBN(1)))
      )
      await assertRevert(
        psyParameters.setPercentDivisor(ZERO_ADDRESS, PERCENT_DIVISOR_SAFETY_MAX.add(toBN(1)))
      )
    })

    it('setPercentDivisor: Owner change parameter - Valid SafeCheck', async () => {
      await psyParameters.setPercentDivisor(ZERO_ADDRESS, PERCENT_DIVISOR_SAFETY_MIN)
      assert.equal(
        PERCENT_DIVISOR_SAFETY_MIN.toString(),
        await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS)
      )

      await psyParameters.setPercentDivisor(ZERO_ADDRESS, PERCENT_DIVISOR_SAFETY_MAX)
      assert.equal(
        PERCENT_DIVISOR_SAFETY_MAX.toString(),
        await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS)
      )
    })

    it('setBorrowingFeeFloor: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(
        psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, BORROWING_FEE_FLOOR_SAFETY_MAX.add(toBN(1)))
      )
    })

    it('setBorrowingFeeFloor: Owner change parameter - Valid SafeCheck', async () => {
      const expectedMin = applyDecimalPrecision(BORROWING_FEE_FLOOR_SAFETY_MIN)
      const expectedMax = applyDecimalPrecision(BORROWING_FEE_FLOOR_SAFETY_MAX.sub(toBN(1)))

      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, BORROWING_FEE_FLOOR_SAFETY_MIN)
      assert.equal(expectedMin.toString(), await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS))

      await psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, MAX_BORROWING_FEE_SAFETY_MAX)
      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, BORROWING_FEE_FLOOR_SAFETY_MAX.sub(toBN(1)))
      assert.equal(expectedMax.toString(), await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS))
    })

    it('setMaxBorrowingFee: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(
        psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, MAX_BORROWING_FEE_SAFETY_MAX.add(toBN(1)))
      )
    })

    it('setMaxBorrowingFee: Owner change parameter - Valid SafeCheck', async () => {
      const expectedMin = applyDecimalPrecision(MAX_BORROWING_FEE_SAFETY_MIN.add(toBN(1)))
      const expectedMax = applyDecimalPrecision(MAX_BORROWING_FEE_SAFETY_MAX)

      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, 1)

      await psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, MAX_BORROWING_FEE_SAFETY_MIN.add(toBN(1)))
      assert.equal(expectedMin.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))

      await psyParameters.setMaxBorrowingFee(ZERO_ADDRESS, MAX_BORROWING_FEE_SAFETY_MAX)
      assert.equal(expectedMax.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))
    })

    it('setDebtCeiling: Owner change parameter - Valid Check', async () => {
      await psyParameters.setDebtCeiling(ZERO_ADDRESS, 1)
      assert.equal(toBN(1).toString(), await psyParameters.DEBT_CEILINGS(ZERO_ADDRESS))
    })

    /*
    floor is now zero
    it('setRedemptionFeeFloor: Owner change parameter - Failing SafeCheck', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await assertRevert(
        psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, REDEMPTION_FEE_FLOOR_SAFETY_MIN.sub(toBN(1)))
      )
      await assertRevert(
        psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, REDEMPTION_FEE_FLOOR_SAFETY_MAX.add(toBN(1)))
      )
    })
    */

    it('setRedemptionFeeFloor: Owner change parameter - Valid SafeCheck', async () => {
      const expectedMin = applyDecimalPrecision(REDEMPTION_FEE_FLOOR_SAFETY_MIN)
      const expectedMax = applyDecimalPrecision(REDEMPTION_FEE_FLOOR_SAFETY_MAX)

      await psyParameters.sanitizeParameters(ZERO_ADDRESS)

      await psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, REDEMPTION_FEE_FLOOR_SAFETY_MIN)
      assert.equal(expectedMin.toString(), await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS))

      await psyParameters.setRedemptionFeeFloor(ZERO_ADDRESS, REDEMPTION_FEE_FLOOR_SAFETY_MAX)
      assert.equal(expectedMax.toString(), await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS))
    })

    it('setCollateralParameters: Owner change parameter - Failing SafeCheck', async () => {
      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR_SAFETY_MAX.add(toBN(1)),
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR_SAFETY_MAX.add(toBN(1)),
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          SLSD_GAS_COMPENSATION_SAFETY_MAX.add(toBN(1)),
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT_SAFETY_MAX.add(toBN(1)),
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR_SAFETY_MAX.add(toBN(1)),
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR_SAFETY_MAX.add(toBN(1)),
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE_SAFETY_MAX.add(toBN(1)),
          REDEMPTION_FEE_FLOOR,
          DEBT_CEIL
        )
      )

      await assertRevert(
        psyParameters.setCollateralParameters(
          ZERO_ADDRESS,
          MCR,
          CCR,
          GAS_COMPENSATION,
          MIN_NET_DEBT,
          PERCENT_DIVISOR,
          BORROWING_FEE_FLOOR,
          MAX_BORROWING_FEE,
          REDEMPTION_FEE_FLOOR_SAFETY_MAX.add(toBN(1)),
          DEBT_CEIL
        )
      )
    })

    it('setCollateralParameters: Owner change parameter - Valid SafeCheck Then Reset', async () => {
      const newMCR = MCR_SAFETY_MAX
      const newCCR = CCR_SAFETY_MIN
      const newGasComp = SLSD_GAS_COMPENSATION_SAFETY_MAX
      const newMinNetDebt = MIN_NET_DEBT_SAFETY_MAX
      const newPercentDivisor = PERCENT_DIVISOR_SAFETY_MIN
      const newBorrowingFeeFloor = BORROWING_FEE_FLOOR_SAFETY_MIN
      const newMaxBorrowingFee = MAX_BORROWING_FEE_SAFETY_MAX
      const newRedemptionFeeFloor = REDEMPTION_FEE_FLOOR_SAFETY_MIN

      const expectedBorrowingFeeFloor = applyDecimalPrecision(newBorrowingFeeFloor)
      const expectedMaxBorrowingFee = applyDecimalPrecision(newMaxBorrowingFee)
      const expectedRedemptionFeeFloor = applyDecimalPrecision(newRedemptionFeeFloor)

      await psyParameters.setCollateralParameters(
        ZERO_ADDRESS,
        newMCR,
        newCCR,
        newGasComp,
        newMinNetDebt,
        newPercentDivisor,
        newBorrowingFeeFloor,
        newMaxBorrowingFee,
        newRedemptionFeeFloor,
        DEBT_CEIL,
        { from: owner }
      )

      assert.equal(newMCR.toString(), await psyParameters.MCR(ZERO_ADDRESS))
      assert.equal(newCCR.toString(), await psyParameters.CCR(ZERO_ADDRESS))
      assert.equal(newGasComp.toString(), await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS))
      assert.equal(newMinNetDebt.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))
      assert.equal(newPercentDivisor.toString(), await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS))
      assert.equal(
        expectedBorrowingFeeFloor.toString(),
        await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS)
      )
      assert.equal(expectedMaxBorrowingFee.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))
      assert.equal(
        expectedRedemptionFeeFloor.toString(),
        await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS)
      )

      await psyParameters.setAsDefault(ZERO_ADDRESS)

      assert.equal(MCR.toString(), await psyParameters.MCR(ZERO_ADDRESS))
      assert.equal(CCR.toString(), await psyParameters.CCR(ZERO_ADDRESS))
      assert.equal(GAS_COMPENSATION.toString(), await psyParameters.SLSD_GAS_COMPENSATION(ZERO_ADDRESS))
      assert.equal(MIN_NET_DEBT.toString(), await psyParameters.MIN_NET_DEBT(ZERO_ADDRESS))
      assert.equal(PERCENT_DIVISOR.toString(), await psyParameters.PERCENT_DIVISOR(ZERO_ADDRESS))
      assert.equal(BORROWING_FEE_FLOOR.toString(), await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS))
      assert.equal(MAX_BORROWING_FEE.toString(), await psyParameters.MAX_BORROWING_FEE(ZERO_ADDRESS))
      assert.equal(REDEMPTION_FEE_FLOOR.toString(), await psyParameters.REDEMPTION_FEE_FLOOR(ZERO_ADDRESS))
    })

    it('openTrove(): Borrowing at zero base rate charges minimum fee with different borrowingFeeFloor', async () => {
      await psyParameters.sanitizeParameters(ZERO_ADDRESS)
      await psyParameters.sanitizeParameters(erc20.address)

      await psyParameters.setBorrowingFeeFloor(ZERO_ADDRESS, BORROWING_FEE_FLOOR_SAFETY_MIN)
      await psyParameters.setBorrowingFeeFloor(erc20.address, BORROWING_FEE_FLOOR_SAFETY_MIN)
      await psyParameters.setMaxBorrowingFee(erc20.address, MAX_BORROWING_FEE_SAFETY_MAX)
      await psyParameters.setBorrowingFeeFloor(erc20.address, BORROWING_FEE_FLOOR_SAFETY_MAX.sub(toBN(1)))

      assert.equal(
        applyDecimalPrecision(BORROWING_FEE_FLOOR_SAFETY_MIN).toString(),
        await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS)
      )
      assert.equal(
        applyDecimalPrecision(BORROWING_FEE_FLOOR_SAFETY_MAX.sub(toBN(1))).toString(),
        await psyParameters.BORROWING_FEE_FLOOR(erc20.address)
      )

      await openTrove({
        extraSLSDAmount: toBN(dec(5000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      })
      await openTrove({
        extraSLSDAmount: toBN(dec(5000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      })

      await openTrove({
        asset: erc20.address,
        extraSLSDAmount: toBN(dec(5000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      })
      
      //change Debt ceiling
      await psyParameters.setDebtCeiling(erc20.address, 1)
      await assertRevert(
        openTrove({
          asset: erc20.address,
          extraSLSDAmount: toBN(dec(5000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: B },
        }), 
      'Exceeds Debt Ceiling')

      //restore Debt ceiling
      await psyParameters.setDebtCeiling(erc20.address, dec(1000000000, 18))
      await openTrove({
        asset: erc20.address,
        extraSLSDAmount: toBN(dec(5000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      })

      const USDVRequest = toBN(dec(10000, 18))
      const txC = await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        USDVRequest,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(100, 'ether'), from: C }
      )
      const txC_Asset = await borrowerOperations.openTrove(
        erc20.address,
        dec(100, 'ether'),
        th._100pct,
        USDVRequest,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: C }
      )
      const _SLSDFee = toBN(th.getEventArgByName(txC, 'SLSDBorrowingFeePaid', '_SLSDFee'))
      const _USDVFee_Asset = toBN(th.getEventArgByName(txC_Asset, 'SLSDBorrowingFeePaid', '_SLSDFee'))

      const expectedFee = (await psyParameters.BORROWING_FEE_FLOOR(ZERO_ADDRESS))
        .mul(toBN(USDVRequest))
        .div(toBN(dec(1, 18)))
      const expectedFee_Asset = (await psyParameters.BORROWING_FEE_FLOOR(erc20.address))
        .mul(toBN(USDVRequest))
        .div(toBN(dec(1, 18)))
      assert.isTrue(_SLSDFee.eq(expectedFee))
      assert.isTrue(_USDVFee_Asset.eq(expectedFee_Asset))
    })
  })
})
