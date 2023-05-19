const Decimal = require('decimal.js')
const deploymentHelper = require('../utils/deploymentHelpers.js')
const { BNConverter } = require('../utils/BNConverter.js')
const testHelpers = require('../utils/testHelpers.js')

const PSYStakingTester = artifacts.require('PSYStakingTester')
const TroveManagerTester = artifacts.require('TroveManagerTester')
const NonPayable = artifacts.require('./NonPayable.sol')

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const dec = th.dec
const assertRevert = th.assertRevert

const toBN = th.toBN
const ZERO = th.toBN('0')

/* NOTE: These tests do not test for specific ETH and SLSD gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific ETH/SLSD gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 */

contract('PSYStaking revenue share tests', async (accounts) => {
  const ZERO_ADDRESS = th.ZERO_ADDRESS

  const multisig = accounts[999]

  const [owner, A, B, C, D, E, F, G, whale] = accounts

  let priceFeed
  let slsdToken
  let sortedTroves
  let troveManager
  let troveManagerHelpers
  let activePool
  let stabilityPool
  let defaultPool
  let borrowerOperations
  let psyStaking
  let psyToken
  let erc20

  let contracts

  const openTrove = async (params) => th.openTrove(contracts, params)

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore()
    contracts.troveManager = await TroveManagerTester.new()
    contracts = await deploymentHelper.deploySLSDToken(contracts)
    const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(accounts[0])

    await deploymentHelper.connectCoreContracts(contracts, PSYContracts)
    await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts)

    nonPayable = await NonPayable.new()
    priceFeed = contracts.priceFeedTestnet
    slsdToken = contracts.slsdToken
    sortedTroves = contracts.sortedTroves
    troveManager = contracts.troveManager
    troveManagerHelpers = contracts.troveManagerHelpers
    activePool = contracts.activePool
    stabilityPool = contracts.stabilityPool
    defaultPool = contracts.defaultPool
    borrowerOperations = contracts.borrowerOperations
    hintHelpers = contracts.hintHelpers
    erc20 = contracts.erc20

    psyToken = PSYContracts.psyToken
    psyStaking = PSYContracts.psyStaking
    await psyToken.unprotectedMint(multisig, dec(5, 24))

    let index = 0
    for (const acc of accounts) {
      await psyToken.approve(psyStaking.address, await web3.eth.getBalance(acc), { from: acc })
      await erc20.mint(acc, await web3.eth.getBalance(acc))
      index++

      if (index >= 20) break
    }
  })

  it('stake(): reverts if amount is zero', async () => {
    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await assertRevert(psyStaking.stake(0, { from: A }), 'PSYStaking: Amount must be non-zero')
  })

  it('ETH fee per PSY staked increases when a redemption fee is triggered and totalStakes > 0', async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(100, 18), { from: A })

    // Check ETH fee per unit staked is zero
    const F_ETH_Before = await psyStaking.F_ASSETS(ZERO_ADDRESS)
    const F_ETH_Before_Asset = await psyStaking.F_ASSETS(erc20.address)
    assert.equal(F_ETH_Before, '0')
    assert.equal(F_ETH_Before_Asset, '0')

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee emitted in event is non-zero
    const emittedETHFee = toBN(th.getEmittedRedemptionValues(redemptionTx)[3])
    const emittedETHFee_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_Asset)[3])
    assert.isTrue(emittedETHFee.gt(toBN('0')))
    assert.isTrue(emittedETHFee_Asset.gt(toBN('0')))

    // Check ETH fee per unit staked has increased by correct amount
    const F_ETH_After = await psyStaking.F_ASSETS(ZERO_ADDRESS)
    const F_ETH_After_Asset = await psyStaking.F_ASSETS(erc20.address)

    // Expect fee per unit staked = fee/100, since there is 100 SLSD totalStaked
    const expected_F_ETH_After = emittedETHFee.div(toBN('100'))
    const expected_F_ETH_After_Asset = emittedETHFee_Asset.div(toBN('100'))

    assert.isTrue(expected_F_ETH_After.eq(F_ETH_After))
    assert.isTrue(expected_F_ETH_After_Asset.eq(F_ETH_After_Asset))
  })

  it("ETH fee per PSY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // Check ETH fee per unit staked is zero
    assert.equal(await psyStaking.F_ASSETS(ZERO_ADDRESS), '0')
    assert.equal(await psyStaking.F_ASSETS(erc20.address), '0')

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee emitted in event is non-zero
    const emittedETHFee = toBN(th.getEmittedRedemptionValues(redemptionTx)[3])
    const emittedETHFee_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_Asset)[3])
    assert.isTrue(emittedETHFee.gt(toBN('0')))
    assert.isTrue(emittedETHFee_Asset.gt(toBN('0')))

    // Check ETH fee per unit staked has not increased
    assert.equal(await psyStaking.F_ASSETS(ZERO_ADDRESS), '0')
    assert.equal(await psyStaking.F_ASSETS(erc20.address), '0')
  })

  it('SLSD fee per PSY staked increases when a redemption fee is triggered and totalStakes > 0', async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // A makes stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(100, 18), { from: A })

    // Check SLSD fee per unit staked is zero
    assert.equal(await psyStaking.F_ASSETS(ZERO_ADDRESS), '0')
    assert.equal(await psyStaking.F_ASSETS(erc20.address), '0')

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), erc20.address)

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // Check base rate is now non-zero
    assert.isTrue((await troveManagerHelpers.baseRate(ZERO_ADDRESS)).gt(toBN('0')))
    assert.isTrue((await troveManagerHelpers.baseRate(erc20.address)).gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(27, 18), D, D, { from: D })
    const tx_Asset = await borrowerOperations.withdrawSLSD(erc20.address, th._100pct, dec(27, 18), D, D, {
      from: D,
    })

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(tx))
    const emittedSLSDFee_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(tx_Asset))
    assert.isTrue(emittedSLSDFee.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_Asset.gt(toBN('0')))

    // Check SLSD fee per unit staked has increased by correct amount
    const F_SLSD_After = await psyStaking.F_SLSD()

    // Expect fee per unit staked = fee/100, since there is 100 SLSD totalStaked
    const expected_F_SLSD_After = emittedSLSDFee.div(toBN('100'))
    const expected_F_SLSD_After_Asset = emittedSLSDFee_Asset.div(toBN('100'))

    assert.isTrue(expected_F_SLSD_After.add(expected_F_SLSD_After_Asset).eq(F_SLSD_After))
  })

  it("SLSD fee per PSY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // Check SLSD fee per unit staked is zero
    assert.equal(await psyStaking.F_ASSETS(ZERO_ADDRESS), '0')
    assert.equal(await psyStaking.F_ASSETS(erc20.address), '0')

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), erc20.address)

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // Check base rate is now non-zero
    assert.isTrue((await troveManagerHelpers.baseRate(ZERO_ADDRESS)).gt(toBN('0')))
    assert.isTrue((await troveManagerHelpers.baseRate(erc20.address)).gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(27, 18), D, D, { from: D })
    const tx_Asset = await borrowerOperations.withdrawSLSD(erc20.address, th._100pct, dec(27, 18), D, D, {
      from: D,
    })

    // Check SLSD fee value in event is non-zero
    assert.isTrue(toBN(th.getSLSDFeeFromSLSDBorrowingEvent(tx)).gt(toBN('0')))
    assert.isTrue(toBN(th.getSLSDFeeFromSLSDBorrowingEvent(tx_Asset)).gt(toBN('0')))

    // Check SLSD fee per unit staked did not increase, is still zero
    const F_SLSD_After = await psyStaking.F_SLSD()
    assert.equal(F_SLSD_After, '0')
  })

  it('PSY Staking: A single staker earns all ETH and PSY fees that occur', async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // A makes stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(100, 18), { from: A })

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_1_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(th.getEmittedRedemptionValues(redemptionTx_1)[3])
    const emittedETHFee_1_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_1_Asset)[3])
    assert.isTrue(emittedETHFee_1.gt(toBN('0')))
    assert.isTrue(emittedETHFee_1_Asset.gt(toBN('0')))

    const C_BalBeforeREdemption = await slsdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    const redemptionTx_2_Asset = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const C_BalAfterRedemption = await slsdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))

    // check ETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(th.getEmittedRedemptionValues(redemptionTx_2)[3])
    const emittedETHFee_2_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_2_Asset)[3])
    assert.isTrue(emittedETHFee_2.gt(toBN('0')))
    assert.isTrue(emittedETHFee_2_Asset.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSLSD(
      ZERO_ADDRESS,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )
    const borrowingTx_1_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_1 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1))
    const emittedSLSDFee_1_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1_Asset))
    assert.isTrue(emittedSLSDFee_1.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_1_Asset.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(17, 18), B, B, {
      from: B,
    })
    const borrowingTx_2_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_2 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2))
    const emittedSLSDFee_2_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2_Asset))
    assert.isTrue(emittedSLSDFee_2.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_2_Asset.gt(toBN('0')))

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2)
    const expectedTotalETHGain_Asset = emittedETHFee_1_Asset.add(emittedETHFee_2_Asset)

    const expectedTotalSLSDGain = emittedSLSDFee_1
      .add(emittedSLSDFee_1_Asset)
      .add(emittedSLSDFee_2)
      .add(emittedSLSDFee_2_Asset)

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_Before = toBN(await slsdToken.balanceOf(A))

    // A un-stakes
    await psyStaking.unstake(dec(100, 18), { from: A, gasPrice: 0 })

    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_After_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_After = toBN(await slsdToken.balanceOf(A))

    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before)
    const A_SLSDGain = A_SLSDBalance_After.sub(A_SLSDBalance_Before)

    const A_ETHGain_Asset = A_ETHBalance_After_Asset.sub(A_ETHBalance_Before_Asset)

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalETHGain_Asset.div(toBN(10 ** 10)), A_ETHGain_Asset), 1000)
    assert.isAtMost(th.getDifference(expectedTotalSLSDGain, A_SLSDGain), 1000)
  })

  it('stake(): Top-up sends out all accumulated ETH and SLSD gains to the staker', async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // A makes stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(50, 18), { from: A })

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_1_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(th.getEmittedRedemptionValues(redemptionTx_1)[3])
    const emittedETHFee_1_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_1_Asset)[3])
    assert.isTrue(emittedETHFee_1.gt(toBN('0')))
    assert.isTrue(emittedETHFee_1_Asset.gt(toBN('0')))

    const C_BalBeforeREdemption = await slsdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    const redemptionTx_2_Asset = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const C_BalAfterRedemption = await slsdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))

    // check ETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(th.getEmittedRedemptionValues(redemptionTx_2)[3])
    const emittedETHFee_2_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_2_Asset)[3])
    assert.isTrue(emittedETHFee_2.gt(toBN('0')))
    assert.isTrue(emittedETHFee_2_Asset.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSLSD(
      ZERO_ADDRESS,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )
    const borrowingTx_1_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_1 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1))
    const emittedSLSDFee_1_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1_Asset))
    assert.isTrue(emittedSLSDFee_1.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_1_Asset.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(17, 18), B, B, {
      from: B,
    })
    const borrowingTx_2_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_2 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2))
    const emittedSLSDFee_2_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2_Asset))
    assert.isTrue(emittedSLSDFee_2.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_2_Asset.gt(toBN('0')))

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2)
    const expectedTotalETHGain_Asset = emittedETHFee_1_Asset.add(emittedETHFee_2_Asset)

    const expectedTotalSLSDGain = emittedSLSDFee_1
      .add(emittedSLSDFee_1_Asset)
      .add(emittedSLSDFee_2.add(emittedSLSDFee_2_Asset))

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_Before = toBN(await slsdToken.balanceOf(A))

    // A tops up
    await psyStaking.stake(dec(50, 18), { from: A, gasPrice: 0 })

    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_After_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_After = toBN(await slsdToken.balanceOf(A))

    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before)
    const A_ETHGain_Asset = A_ETHBalance_After_Asset.sub(A_ETHBalance_Before_Asset)
    const A_SLSDGain = A_SLSDBalance_After.sub(A_SLSDBalance_Before)

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalETHGain_Asset.div(toBN(10 ** 10)), A_ETHGain_Asset), 1000)
    assert.isAtMost(th.getDifference(expectedTotalSLSDGain, A_SLSDGain), 1000)
  })

  it("getPendingETHGain(): Returns the staker's correct pending ETH gain", async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // A makes stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(50, 18), { from: A })

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_1_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(th.getEmittedRedemptionValues(redemptionTx_1)[3])
    const emittedETHFee_1_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_1_Asset)[3])
    assert.isTrue(emittedETHFee_1.gt(toBN('0')))
    assert.isTrue(emittedETHFee_1_Asset.gt(toBN('0')))

    const C_BalBeforeREdemption = await slsdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    const redemptionTx_2_Asset = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const C_BalAfterRedemption = await slsdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))

    // check ETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(th.getEmittedRedemptionValues(redemptionTx_2)[3])
    const emittedETHFee_2_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_2_Asset)[3])
    assert.isTrue(emittedETHFee_2.gt(toBN('0')))
    assert.isTrue(emittedETHFee_2_Asset.gt(toBN('0')))

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2)
    const expectedTotalETHGain_Asset = emittedETHFee_1_Asset.add(emittedETHFee_2_Asset)

    const A_ETHGain = await psyStaking.getPendingAssetGain(ZERO_ADDRESS, A)
    const A_ETHGain_Asset = await psyStaking.getPendingAssetGain(erc20.address, A)

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalETHGain_Asset, A_ETHGain_Asset), 1000)
  })

  it("getPendingSLSDGain(): Returns the staker's correct pending SLSD gain", async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A
    await psyToken.transfer(A, dec(100, 18), { from: multisig })

    // A makes stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyStaking.stake(dec(50, 18), { from: A })

    const B_BalBeforeRedemption = await slsdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    const redemptionTx_1_Asset = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const B_BalAfterRedemption = await slsdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeRedemption))

    // check ETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(th.getEmittedRedemptionValues(redemptionTx_1)[3])
    const emittedETHFee_1_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_1_Asset)[3])
    assert.isTrue(emittedETHFee_1.gt(toBN('0')))
    assert.isTrue(emittedETHFee_1_Asset.gt(toBN('0')))

    const C_BalBeforeREdemption = await slsdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    const redemptionTx_2_Asset = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      erc20.address
    )

    const C_BalAfterRedemption = await slsdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))

    // check ETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(th.getEmittedRedemptionValues(redemptionTx_2)[3])
    const emittedETHFee_2_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_2_Asset)[3])
    assert.isTrue(emittedETHFee_2.gt(toBN('0')))
    assert.isTrue(emittedETHFee_2_Asset.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSLSD(
      ZERO_ADDRESS,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )
    const borrowingTx_1_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_1 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1))
    const emittedSLSDFee_1_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1_Asset))
    assert.isTrue(emittedSLSDFee_1.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_1_Asset.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(17, 18), B, B, {
      from: B,
    })
    const borrowingTx_2_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    )

    // Check SLSD fee value in event is non-zero
    const emittedSLSDFee_2 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2))
    const emittedSLSDFee_2_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2_Asset))
    assert.isTrue(emittedSLSDFee_2.gt(toBN('0')))
    assert.isTrue(emittedSLSDFee_2_Asset.gt(toBN('0')))

    const expectedTotalSLSDGain = emittedSLSDFee_1.add(emittedSLSDFee_2)
    const expectedTotalSLSDGain_Asset = emittedSLSDFee_1_Asset.add(emittedSLSDFee_2_Asset)
    const A_SLSDGain = await psyStaking.getPendingSLSDGain(A)

    assert.isAtMost(
      th.getDifference(expectedTotalSLSDGain.add(expectedTotalSLSDGain_Asset), A_SLSDGain),
      1000
    )
  })

  // - multi depositors, several rewards
  it('PSY Staking: Multiple stakers earn the correct share of all ETH and PSY fees, based on their stake size', async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G },
    })

    // FF time one year so owner can transfer PSY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A, B, C
    await psyToken.transfer(A, dec(100, 18), { from: multisig })
    await psyToken.transfer(B, dec(200, 18), { from: multisig })
    await psyToken.transfer(C, dec(300, 18), { from: multisig })

    // A, B, C make stake
    await psyToken.approve(psyStaking.address, dec(100, 18), { from: A })
    await psyToken.approve(psyStaking.address, dec(200, 18), { from: B })
    await psyToken.approve(psyStaking.address, dec(300, 18), { from: C })
    await psyStaking.stake(dec(100, 18), { from: A })
    await psyStaking.stake(dec(200, 18), { from: B })
    await psyStaking.stake(dec(300, 18), { from: C })

    // Confirm staking contract holds 600 PSY
    // console.log(`PSY staking PSY bal: ${await PSYToken.balanceOf(psyStaking.address)}`)
    assert.equal(await psyToken.balanceOf(psyStaking.address), dec(600, 18))
    assert.equal(await psyStaking.totalPSYStaked(), dec(600, 18))

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(F, contracts, dec(45, 18))
    const emittedETHFee_1 = toBN(th.getEmittedRedemptionValues(redemptionTx_1)[3])
    assert.isTrue(emittedETHFee_1.gt(toBN('0')))

    const redemptionTx_1_Asset = await th.redeemCollateralAndGetTxObject(
      F,
      contracts,
      dec(45, 18),
      erc20.address
    )
    const emittedETHFee_1_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_1_Asset)[3])
    assert.isTrue(emittedETHFee_1_Asset.gt(toBN('0')))

    // G redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(G, contracts, dec(197, 18))
    const emittedETHFee_2 = toBN(th.getEmittedRedemptionValues(redemptionTx_2)[3])
    assert.isTrue(emittedETHFee_2.gt(toBN('0')))

    const redemptionTx_2_Asset = await th.redeemCollateralAndGetTxObject(
      G,
      contracts,
      dec(197, 18),
      erc20.address
    )
    const emittedETHFee_2_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_2_Asset)[3])
    assert.isTrue(emittedETHFee_2_Asset.gt(toBN('0')))

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSLSD(
      ZERO_ADDRESS,
      th._100pct,
      dec(104, 18),
      F,
      F,
      { from: F }
    )
    const emittedSLSDFee_1 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedSLSDFee_1.gt(toBN('0')))

    const borrowingTx_1_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(104, 18),
      F,
      F,
      { from: F }
    )
    const emittedSLSDFee_1_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_1_Asset))
    assert.isTrue(emittedSLSDFee_1_Asset.gt(toBN('0')))

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(17, 18), G, G, {
      from: G,
    })
    const emittedSLSDFee_2 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedSLSDFee_2.gt(toBN('0')))

    const borrowingTx_2_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    )
    const emittedSLSDFee_2_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_2_Asset))
    assert.isTrue(emittedSLSDFee_2_Asset.gt(toBN('0')))

    // D obtains PSY from owner and makes a stake
    await psyToken.transfer(D, dec(50, 18), { from: multisig })
    await psyToken.approve(psyStaking.address, dec(50, 18), { from: D })
    await psyStaking.stake(dec(50, 18), { from: D })

    // Confirm staking contract holds 650 PSY
    assert.equal(await psyToken.balanceOf(psyStaking.address), dec(650, 18))
    assert.equal(await psyStaking.totalPSYStaked(), dec(650, 18))

    // G redeems
    const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(197, 18))
    const emittedETHFee_3 = toBN(th.getEmittedRedemptionValues(redemptionTx_3)[3])
    assert.isTrue(emittedETHFee_3.gt(toBN('0')))

    const redemptionTx_3_Asset = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(197, 18),
      erc20.address
    )
    const emittedETHFee_3_Asset = toBN(th.getEmittedRedemptionValues(redemptionTx_3_Asset)[3])
    assert.isTrue(emittedETHFee_3_Asset.gt(toBN('0')))

    // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawSLSD(ZERO_ADDRESS, th._100pct, dec(17, 18), G, G, {
      from: G,
    })
    const emittedSLSDFee_3 = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_3))
    assert.isTrue(emittedSLSDFee_3.gt(toBN('0')))

    const borrowingTx_3_Asset = await borrowerOperations.withdrawSLSD(
      erc20.address,
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    )
    const emittedSLSDFee_3_Asset = toBN(th.getSLSDFeeFromSLSDBorrowingEvent(borrowingTx_3_Asset))
    assert.isTrue(emittedSLSDFee_3_Asset.gt(toBN('0')))

    /*  
    Expected rewards:

    A_ETH: (100* ETHFee_1)/600 + (100* ETHFee_2)/600 + (100*ETH_Fee_3)/650
    B_ETH: (200* ETHFee_1)/600 + (200* ETHFee_2)/600 + (200*ETH_Fee_3)/650
    C_ETH: (300* ETHFee_1)/600 + (300* ETHFee_2)/600 + (300*ETH_Fee_3)/650
    D_ETH:                                             (100*ETH_Fee_3)/650

    A_SLSD: (100*SLSDFee_1 )/600 + (100* SLSDFee_2)/600 + (100*SLSDFee_3)/650
    B_SLSD: (200* SLSDFee_1)/600 + (200* SLSDFee_2)/600 + (200*SLSDFee_3)/650
    C_SLSD: (300* SLSDFee_1)/600 + (300* SLSDFee_2)/600 + (300*SLSDFee_3)/650
    D_SLSD:                                               (100*SLSDFee_3)/650
    */

    // Expected ETH gains
    const expectedETHGain_A = toBN('100')
      .mul(emittedETHFee_1)
      .div(toBN('600'))
      .add(toBN('100').mul(emittedETHFee_2).div(toBN('600')))
      .add(toBN('100').mul(emittedETHFee_3).div(toBN('650')))

    const expectedETHGain_B = toBN('200')
      .mul(emittedETHFee_1)
      .div(toBN('600'))
      .add(toBN('200').mul(emittedETHFee_2).div(toBN('600')))
      .add(toBN('200').mul(emittedETHFee_3).div(toBN('650')))

    const expectedETHGain_C = toBN('300')
      .mul(emittedETHFee_1)
      .div(toBN('600'))
      .add(toBN('300').mul(emittedETHFee_2).div(toBN('600')))
      .add(toBN('300').mul(emittedETHFee_3).div(toBN('650')))

    const expectedETHGain_D = toBN('50').mul(emittedETHFee_3).div(toBN('650'))

    const expectedETHGain_A_Asset = toBN('100')
      .mul(emittedETHFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('100').mul(emittedETHFee_2_Asset).div(toBN('600')))
      .add(toBN('100').mul(emittedETHFee_3_Asset).div(toBN('650')))

    const expectedETHGain_B_Asset = toBN('200')
      .mul(emittedETHFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('200').mul(emittedETHFee_2_Asset).div(toBN('600')))
      .add(toBN('200').mul(emittedETHFee_3_Asset).div(toBN('650')))

    const expectedETHGain_C_Asset = toBN('300')
      .mul(emittedETHFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('300').mul(emittedETHFee_2_Asset).div(toBN('600')))
      .add(toBN('300').mul(emittedETHFee_3_Asset).div(toBN('650')))

    const expectedETHGain_D_Asset = toBN('50').mul(emittedETHFee_3_Asset).div(toBN('650'))

    // Expected SLSD gains:
    const expectedSLSDGain_A = toBN('100')
      .mul(emittedSLSDFee_1)
      .div(toBN('600'))
      .add(toBN('100').mul(emittedSLSDFee_2).div(toBN('600')))
      .add(toBN('100').mul(emittedSLSDFee_3).div(toBN('650')))

    const expectedSLSDGain_B = toBN('200')
      .mul(emittedSLSDFee_1)
      .div(toBN('600'))
      .add(toBN('200').mul(emittedSLSDFee_2).div(toBN('600')))
      .add(toBN('200').mul(emittedSLSDFee_3).div(toBN('650')))

    const expectedSLSDGain_C = toBN('300')
      .mul(emittedSLSDFee_1)
      .div(toBN('600'))
      .add(toBN('300').mul(emittedSLSDFee_2).div(toBN('600')))
      .add(toBN('300').mul(emittedSLSDFee_3).div(toBN('650')))

    const expectedSLSDGain_D = toBN('50').mul(emittedSLSDFee_3).div(toBN('650'))

    const expectedSLSDGain_A_Asset = toBN('100')
      .mul(emittedSLSDFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('100').mul(emittedSLSDFee_2_Asset).div(toBN('600')))
      .add(toBN('100').mul(emittedSLSDFee_3_Asset).div(toBN('650')))

    const expectedSLSDGain_B_Asset = toBN('200')
      .mul(emittedSLSDFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('200').mul(emittedSLSDFee_2_Asset).div(toBN('600')))
      .add(toBN('200').mul(emittedSLSDFee_3_Asset).div(toBN('650')))

    const expectedSLSDGain_C_Asset = toBN('300')
      .mul(emittedSLSDFee_1_Asset)
      .div(toBN('600'))
      .add(toBN('300').mul(emittedSLSDFee_2_Asset).div(toBN('600')))
      .add(toBN('300').mul(emittedSLSDFee_3_Asset).div(toBN('650')))

    const expectedSLSDGain_D_Asset = toBN('50').mul(emittedSLSDFee_3_Asset).div(toBN('650'))

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_Before = toBN(await slsdToken.balanceOf(A))
    const B_ETHBalance_Before = toBN(await web3.eth.getBalance(B))
    const B_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(B))
    const B_SLSDBalance_Before = toBN(await slsdToken.balanceOf(B))
    const C_ETHBalance_Before = toBN(await web3.eth.getBalance(C))
    const C_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(C))
    const C_SLSDBalance_Before = toBN(await slsdToken.balanceOf(C))
    const D_ETHBalance_Before = toBN(await web3.eth.getBalance(D))
    const D_ETHBalance_Before_Asset = toBN(await erc20.balanceOf(D))
    const D_SLSDBalance_Before = toBN(await slsdToken.balanceOf(D))

    // A-D un-stake
    await psyStaking.unstake(dec(100, 18), { from: A, gasPrice: 0 })
    await psyStaking.unstake(dec(200, 18), { from: B, gasPrice: 0 })
    await psyStaking.unstake(dec(400, 18), { from: C, gasPrice: 0 })
    await psyStaking.unstake(dec(50, 18), { from: D, gasPrice: 0 })

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await psyToken.balanceOf(psyStaking.address), '0')
    assert.equal(await psyStaking.totalPSYStaked(), '0')

    // Get A-D ETH and SLSD balances
    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A))
    const A_ETHBalance_After_Asset = toBN(await erc20.balanceOf(A))
    const A_SLSDBalance_After = toBN(await slsdToken.balanceOf(A))
    const B_ETHBalance_After = toBN(await web3.eth.getBalance(B))
    const B_ETHBalance_After_Asset = toBN(await erc20.balanceOf(B))
    const B_SLSDBalance_After = toBN(await slsdToken.balanceOf(B))
    const C_ETHBalance_After = toBN(await web3.eth.getBalance(C))
    const C_ETHBalance_After_Asset = toBN(await erc20.balanceOf(C))
    const C_SLSDBalance_After = toBN(await slsdToken.balanceOf(C))
    const D_ETHBalance_After = toBN(await web3.eth.getBalance(D))
    const D_ETHBalance_After_Asset = toBN(await erc20.balanceOf(D))
    const D_SLSDBalance_After = toBN(await slsdToken.balanceOf(D))

    // Get ETH and SLSD gains
    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before)
    const A_ETHGain_Asset = A_ETHBalance_After_Asset.sub(A_ETHBalance_Before_Asset)
    const A_SLSDGain = A_SLSDBalance_After.sub(A_SLSDBalance_Before)
    const B_ETHGain = B_ETHBalance_After.sub(B_ETHBalance_Before)
    const B_ETHGain_Asset = B_ETHBalance_After_Asset.sub(B_ETHBalance_Before_Asset)
    const B_SLSDGain = B_SLSDBalance_After.sub(B_SLSDBalance_Before)
    const C_ETHGain = C_ETHBalance_After.sub(C_ETHBalance_Before)
    const C_ETHGain_Asset = C_ETHBalance_After_Asset.sub(C_ETHBalance_Before_Asset)
    const C_SLSDGain = C_SLSDBalance_After.sub(C_SLSDBalance_Before)
    const D_ETHGain = D_ETHBalance_After.sub(D_ETHBalance_Before)
    const D_ETHGain_Asset = D_ETHBalance_After_Asset.sub(D_ETHBalance_Before_Asset)
    const D_SLSDGain = D_SLSDBalance_After.sub(D_SLSDBalance_Before)

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedETHGain_A, A_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_A_Asset.div(toBN(10 ** 10)), A_ETHGain_Asset), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_B, B_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_B_Asset.div(toBN(10 ** 10)), B_ETHGain_Asset), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_C, C_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_C_Asset.div(toBN(10 ** 10)), C_ETHGain_Asset), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_D, D_ETHGain), 1000)
    assert.isAtMost(th.getDifference(expectedETHGain_D_Asset.div(toBN(10 ** 10)), D_ETHGain_Asset), 1000)

    assert.isAtMost(th.getDifference(expectedSLSDGain_A.add(expectedSLSDGain_A_Asset), A_SLSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedSLSDGain_B.add(expectedSLSDGain_B_Asset), B_SLSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedSLSDGain_C.add(expectedSLSDGain_C_Asset), C_SLSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedSLSDGain_D.add(expectedSLSDGain_D_Asset), D_SLSDGain), 1000)
  })

  it("unstake(): reverts if caller has ETH gains and can't receive ETH", async () => {
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    })
    await openTrove({
      asset: erc20.address,
      extraSLSDAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    })

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers PSY to staker A and the non-payable proxy
    await psyToken.transfer(A, dec(100, 18), { from: multisig })
    await psyToken.transfer(nonPayable.address, dec(100, 18), { from: multisig })

    //  A makes stake
    const A_stakeTx = await psyStaking.stake(dec(100, 18), { from: A })
    assert.isTrue(A_stakeTx.receipt.status)

    //  A tells proxy to make a stake
    const proxyApproveTxData = await th.getTransactionData('approve(address,uint256)', [
      psyStaking.address,
      '0x56bc75e2d63100000',
    ]) // proxy stakes 100 PSY
    await nonPayable.forward(psyToken.address, proxyApproveTxData, { from: A })

    const proxyStakeTxData = await th.getTransactionData('stake(uint256)', ['0x56bc75e2d63100000']) // proxy stakes 100 PSY
    await nonPayable.forward(psyStaking.address, proxyStakeTxData, { from: A })

    // B makes a redemption, creating ETH gain for proxy
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(45, 18))
    await th.redeemCollateralAndGetTxObject(B, contracts, dec(45, 18), erc20.address)

    assert.isTrue((await psyStaking.getPendingAssetGain(ZERO_ADDRESS, nonPayable.address)).gt(toBN('0')))
    assert.isTrue((await psyStaking.getPendingAssetGain(erc20.address, nonPayable.address)).gt(toBN('0')))

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated ETH gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData('unstake(uint256)', ['0x56bc75e2d63100000']) // proxy stakes 100 PSY
    const proxyUnstakeTxPromise = nonPayable.forward(psyStaking.address, proxyUnStakeTxData, { from: A })

    // but nonPayable proxy can not accept ETH - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise)
  })

  it('receive(): reverts when it receives ETH from an address that is not the Active Pool', async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: psyStaking.address,
      from: A,
      value: dec(1, 'ether'),
    })
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: psyStaking.address,
      from: owner,
      value: dec(1, 'ether'),
    })

    await assertRevert(ethSendTxPromise1)
    await assertRevert(ethSendTxPromise2)
  })

  it('unstake(): reverts if user has no stake', async () => {
    const unstakeTxPromise1 = psyStaking.unstake(1, { from: A })
    const unstakeTxPromise2 = psyStaking.unstake(1, { from: owner })

    await assertRevert(unstakeTxPromise1)
    await assertRevert(unstakeTxPromise2)
  })

  it('Test requireCallerIsTroveManager', async () => {
    const psyStakingTester = await PSYStakingTester.new()
    await assertRevert(psyStakingTester.requireCallerIsTroveManager(), 'PSYStaking: caller is not TroveM')
  })
})
