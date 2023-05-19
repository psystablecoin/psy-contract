const deploymentHelper = require('../utils/deploymentHelpers.js')
const testHelpers = require('../utils/testHelpers.js')

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const dec = th.dec
const toBN = th.toBN
const getDifference = th.getDifference

const TroveManagerTester = artifacts.require('TroveManagerTester')
const SLSDTokenTester = artifacts.require('SLSDTokenTester')
const StabilityPool = artifacts.require('StabilityPool.sol')

contract('StabilityPool - PSY Rewards', async (accounts) => {
  const [
    owner,
    whale,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    defaulter_1,
    defaulter_2,
    defaulter_3,
    defaulter_4,
    defaulter_5,
    defaulter_6,
  ] = accounts

  const [bountyAddress, lpRewardsAddress, multisig, treasury] = accounts.slice(996, 1000)

  let contracts

  let priceFeed
  let slsdToken
  let stabilityPool
  let stabilityPoolERC20
  let erc20
  let sortedTroves
  let troveManager
  let borrowerOperations
  let psyToken
  let communityIssuanceTester

  let issuance_M1 = toBN(dec(Math.round(204_425 * 4.28575), 18))
  let issuance_M2 = toBN(dec(Math.round(204_425 * 4.28575 * 2), 18))

  const ZERO_ADDRESS = th.ZERO_ADDRESS

  const getOpenTroveSLSDAmount = async (totalDebt, asset) =>
    th.getOpenTroveSLSDAmount(contracts, totalDebt, asset)

  const openTrove = async (params) => th.openTrove(contracts, params)
  describe('PSY Rewards', async () => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployLiquityCore()
      contracts.troveManager = await TroveManagerTester.new()
      contracts.slsdToken = await SLSDTokenTester.new(contracts.stabilityPoolManager.address)
      const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(treasury)

      priceFeed = contracts.priceFeedTestnet
      slsdToken = contracts.slsdToken
      sortedTroves = contracts.sortedTroves
      troveManager = contracts.troveManager
      borrowerOperations = contracts.borrowerOperations
      erc20 = contracts.erc20

      psyToken = PSYContracts.psyToken
      communityIssuanceTester = PSYContracts.communityIssuance

      let index = 0
      for (const acc of accounts) {
        await erc20.mint(acc, await web3.eth.getBalance(acc))
        index++

        if (index >= 100) break
      }

      await deploymentHelper.connectCoreContracts(contracts, PSYContracts)
      await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts)

      stabilityPool = await StabilityPool.at(
        await contracts.stabilityPoolManager.getAssetStabilityPool(ZERO_ADDRESS)
      )
      stabilityPoolERC20 = await StabilityPool.at(
        await contracts.stabilityPoolManager.getAssetStabilityPool(erc20.address)
      )

      // Check community issuance starts with 32 million PSY
      assert.isAtMost(
        getDifference(
          toBN(await psyToken.balanceOf(communityIssuanceTester.address)),
          '64000000000000000000000000'
        ),
        1000
      )

      await communityIssuanceTester.setWeeklyPSYDistribution(stabilityPool.address, dec(204_425, 18))
      await communityIssuanceTester.setWeeklyPSYDistribution(stabilityPoolERC20.address, dec(204_425, 18))
    })

    // using the result of this to advance time by the desired amount from the deployment time, whether or not some extra time has passed in the meanwhile
    const getDuration = async (expectedDuration) => {
      const deploymentTime = (await communityIssuanceTester.lastUpdateTime(stabilityPool.address)).toNumber()
      const deploymentTimeERC = (
        await communityIssuanceTester.lastUpdateTime(stabilityPoolERC20.address)
      ).toNumber()

      const time = Math.max(deploymentTime, deploymentTimeERC)
      const currentTime = await th.getLatestBlockTimestamp(web3)
      const duration = Math.max(expectedDuration - (currentTime - time), 0)

      return duration
    }

    it('liquidation < 1 minute after a deposit does not change totalPSYIssued', async () => {
      await openTrove({
        extraSLSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      })
      await openTrove({
        extraSLSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      })

      await openTrove({
        asset: erc20.address,
        extraSLSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      })
      await openTrove({
        asset: erc20.address,
        extraSLSDAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      })

      // A, B provide to SP
      await stabilityPool.provideToSP(dec(10000, 18), { from: A })
      await stabilityPool.provideToSP(dec(5000, 18), { from: B })

      await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: A })
      await stabilityPoolERC20.provideToSP(dec(5000, 18), { from: B })

      await th.fastForwardTime(timeValues.MINUTES_IN_ONE_WEEK, web3.currentProvider)

      await priceFeed.setPrice(dec(105, 18))

      // B adjusts, triggering PSY issuance for all
      await stabilityPool.provideToSP(dec(1, 18), { from: B })
      await stabilityPoolERC20.provideToSP(dec(1, 18), { from: B })
      const blockTimestamp_1 = th.toBN(await th.getLatestBlockTimestamp(web3))

      // Check PSY has been issued
      const totalPSYIssued_1 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
      assert.isTrue(totalPSYIssued_1.gt(toBN('0')))

      const totalPSYIssued_1ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
      assert.isTrue(totalPSYIssued_1ERC20.gt(toBN('0')))

      await troveManager.liquidate(ZERO_ADDRESS, B)
      await troveManager.liquidate(erc20.address, B)
      const blockTimestamp_2 = th.toBN(await th.getLatestBlockTimestamp(web3))

      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, B))
      assert.isFalse(await sortedTroves.contains(erc20.address, B))

      const totalPSYIssued_2 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
      const totalPSYIssued_2ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)

      // check blockTimestamp diff < 60s
      const timestampDiff = blockTimestamp_2.sub(blockTimestamp_1)
      assert.isTrue(timestampDiff.lt(toBN(60)))

      // Check that the liquidation did not alter total PSY issued
      assert.isTrue(totalPSYIssued_2.eq(totalPSYIssued_1))
      assert.isTrue(totalPSYIssued_2ERC20.eq(totalPSYIssued_1ERC20))

      // Check that depositor B has no PSY gain
      assert.equal(await stabilityPool.getDepositorPSYGain(B), '0')
      assert.equal(await stabilityPoolERC20.getDepositorPSYGain(B), '0')

      // Check depositor B has a pending ETH gain
      assert.isTrue((await stabilityPool.getDepositorAssetGain(B)).gt(toBN('0')))
      assert.isTrue((await stabilityPoolERC20.getDepositorAssetGain(B)).gt(toBN('0')))
    })

    it('withdrawFromSP(): reward term G does not update when no PSY is issued', async () => {
      await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), A, A, {
        from: A,
        value: dec(1000, 'ether'),
      })
      await borrowerOperations.openTrove(
        erc20.address,
        dec(1000, 'ether'),
        th._100pct,
        dec(10000, 18),
        A,
        A,
        { from: A }
      )
      await stabilityPool.provideToSP(dec(10000, 18), { from: A })
      await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: A })

      assert.equal((await stabilityPool.deposits(A)).toString(), dec(10000, 18))
      assert.equal((await stabilityPoolERC20.deposits(A)).toString(), dec(10000, 18))

      // defaulter opens trove
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        defaulter_1,
        defaulter_1,
        { from: defaulter_1, value: dec(100, 'ether') }
      )
      await borrowerOperations.openTrove(
        erc20.address,
        dec(100, 'ether'),
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        defaulter_1,
        defaulter_1,
        { from: defaulter_1 }
      )

      // ETH drops
      await priceFeed.setPrice(dec(100, 18))

      await th.fastForwardTime(timeValues.MINUTES_IN_ONE_WEEK, web3.currentProvider)

      // Liquidate d1. Triggers issuance.
      await troveManager.liquidate(ZERO_ADDRESS, defaulter_1)
      await troveManager.liquidate(erc20.address, defaulter_1)
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_1))
      assert.isFalse(await sortedTroves.contains(erc20.address, defaulter_1))

      // Get G and communityIssuance before
      const G_Before = await stabilityPool.epochToScaleToG(0, 0)
      const PSYIssuedBefore = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)

      const G_BeforeERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
      const PSYIssuedBeforeERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)

      //  A withdraws some deposit. Triggers issuance.
      const tx = await stabilityPool.withdrawFromSP(1000, { from: A, gasPrice: 0 })
      assert.isTrue(tx.receipt.status)

      const txERC20 = await stabilityPoolERC20.withdrawFromSP(1000, { from: A, gasPrice: 0 })
      assert.isTrue(txERC20.receipt.status)

      // Check G and PSYIssued do not increase, since <1 minute has passed between issuance triggers
      const G_After = await stabilityPool.epochToScaleToG(0, 0)
      const PSYIssuedAfter = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)

      const G_AfterERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
      const PSYIssuedAfterERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)

      assert.isTrue(G_After.eq(G_Before))
      assert.isTrue(PSYIssuedAfter.eq(PSYIssuedBefore))

      assert.isTrue(G_AfterERC20.eq(G_BeforeERC20))
      assert.isTrue(PSYIssuedAfterERC20.eq(PSYIssuedBeforeERC20))
    })

    // // Simple case: 3 depositors, equal stake. No liquidations. No front-end.
    // it('withdrawFromSP(): Depositors with equal initial deposit withdraw correct PSY gain. No liquidations. No front end.', async () => {
    //   const initialIssuance = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.equal(initialIssuance, 0)

    //   const initialIssuanceERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.equal(initialIssuanceERC20, 0)

    //   // Whale opens Trove with 10k ETH
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), whale, whale, {
    //     from: whale,
    //     value: dec(10000, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(1, 22), A, A, {
    //     from: A,
    //     value: dec(100, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(1, 22), B, B, {
    //     from: B,
    //     value: dec(100, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(1, 22), C, C, {
    //     from: C,
    //     value: dec(100, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(1, 22), D, D, {
    //     from: D,
    //     value: dec(100, 'ether'),
    //   })

    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(10000, 'ether'),
    //     th._100pct,
    //     dec(10000, 18),
    //     whale,
    //     whale,
    //     { from: whale }
    //   )
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(1, 22), B, B, {
    //     from: B,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(1, 22), A, A, {
    //     from: A,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(1, 22), C, C, {
    //     from: C,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(1, 22), D, D, {
    //     from: D,
    //   })

    //   // Check all PSY balances are initially 0
    //   assert.equal(await psyToken.balanceOf(A), 0)
    //   assert.equal(await psyToken.balanceOf(B), 0)
    //   assert.equal(await psyToken.balanceOf(C), 0)

    //   // A, B, C deposit
    //   await stabilityPool.provideToSP(dec(1, 22), { from: A })
    //   await stabilityPool.provideToSP(dec(1, 22), { from: B })
    //   await stabilityPool.provideToSP(dec(1, 22), { from: C })

    //   await stabilityPoolERC20.provideToSP(dec(1, 22), { from: A })
    //   await stabilityPoolERC20.provideToSP(dec(1, 22), { from: B })
    //   await stabilityPoolERC20.provideToSP(dec(1, 22), { from: C })

    //   // One year passes
    //   await th.fastForwardTime(await getDuration(timeValues.SECONDS_IN_ONE_YEAR), web3.currentProvider)

    //   // D deposits, triggering PSY gains for A,B,C. Withdraws immediately after
    //   await stabilityPool.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPool.withdrawFromSP(dec(1, 18), { from: D })

    //   await stabilityPoolERC20.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPoolERC20.withdrawFromSP(dec(1, 18), { from: D })

    //   // Expected gains for each depositor after 1 year (50% total issued).  Each deposit gets 1/3 of issuance.
    //   const expectedPSYGain_1yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2'))
    //     .div(toBN('3'))
    //   const expectedPSYGain_1yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2'))
    //     .div(toBN('3'))

    //   // Check PSY gain
    //   const A_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(C)

    //   const A_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(A)
    //   const B_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(B)
    //   const C_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(C)

    //   // Check gains are correct, error tolerance = 1e-6 of a token

    //   assert.isAtMost(getDifference(A_PSYGain_1yr, expectedPSYGain_1yr), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_1yr, expectedPSYGain_1yr), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_1yr, expectedPSYGain_1yr), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_1yrERC20, expectedPSYGain_1yrERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_1yrERC20, expectedPSYGain_1yrERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_1yrERC20, expectedPSYGain_1yrERC20), 1e12)

    //   // Another year passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    //   // D deposits, triggering PSY gains for A,B,C. Withdraws immediately after
    //   await stabilityPool.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPool.withdrawFromSP(dec(1, 18), { from: D })

    //   await stabilityPoolERC20.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPoolERC20.withdrawFromSP(dec(1, 18), { from: D })

    //   // Expected gains for each depositor after 2 years (75% total issued).  Each deposit gets 1/3 of issuance.
    //   const expectedPSYGain_2yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .mul(toBN('3'))
    //     .div(toBN('4'))
    //     .div(toBN('3'))
    //   const expectedPSYGain_2yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .mul(toBN('3'))
    //     .div(toBN('4'))
    //     .div(toBN('3'))

    //   // Check PSY gain
    //   const A_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(C)

    //   const A_PSYGain_2yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(A)
    //   const B_PSYGain_2yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(B)
    //   const C_PSYGain_2yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(C)

    //   // Check gains are correct, error tolerance = 1e-6 of a token
    //   assert.isAtMost(getDifference(A_PSYGain_2yr, expectedPSYGain_2yr), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_2yr, expectedPSYGain_2yr), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_2yr, expectedPSYGain_2yr), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_2yrERC20, expectedPSYGain_2yrERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_2yrERC20, expectedPSYGain_2yrERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_2yrERC20, expectedPSYGain_2yrERC20), 1e12)

    //   // Each depositor fully withdraws
    //   await stabilityPool.withdrawFromSP(dec(100, 18), { from: A })
    //   await stabilityPool.withdrawFromSP(dec(100, 18), { from: B })
    //   await stabilityPool.withdrawFromSP(dec(100, 18), { from: C })

    //   await stabilityPoolERC20.withdrawFromSP(dec(100, 18), { from: A })
    //   await stabilityPoolERC20.withdrawFromSP(dec(100, 18), { from: B })
    //   await stabilityPoolERC20.withdrawFromSP(dec(100, 18), { from: C })

    //   // Check PSY balances increase by correct amount
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(A), expectedPSYGain_2yr.add(expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(B), expectedPSYGain_2yr.add(expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(C), expectedPSYGain_2yr.add(expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    // })

    // // 3 depositors, varied stake. No liquidations. No front-end.
    // it('withdrawFromSP(): Depositors with varying initial deposit withdraw correct PSY gain. No liquidations. No front end.', async () => {
    //   const initialIssuance = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.equal(initialIssuance, 0)

    //   const initialIssuanceERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.equal(initialIssuanceERC20, 0)

    //   // Whale opens Trove with 10k ETH
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(10000, 18)),
    //     whale,
    //     whale,
    //     { from: whale, value: dec(10000, 'ether') }
    //   )

    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), A, A, {
    //     from: A,
    //     value: dec(200, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(20000, 18), B, B, {
    //     from: B,
    //     value: dec(300, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(30000, 18), C, C, {
    //     from: C,
    //     value: dec(400, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), D, D, {
    //     from: D,
    //     value: dec(100, 'ether'),
    //   })

    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(10000, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(10000, 18)),
    //     whale,
    //     whale,
    //     { from: whale }
    //   )

    //   await borrowerOperations.openTrove(erc20.address, dec(200, 'ether'), th._100pct, dec(10000, 18), A, A, {
    //     from: A,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(300, 'ether'), th._100pct, dec(20000, 18), B, B, {
    //     from: B,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(400, 'ether'), th._100pct, dec(30000, 18), C, C, {
    //     from: C,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(10000, 18), D, D, {
    //     from: D,
    //   })

    //   // Check all PSY balances are initially 0
    //   assert.equal(await psyToken.balanceOf(A), 0)
    //   assert.equal(await psyToken.balanceOf(B), 0)
    //   assert.equal(await psyToken.balanceOf(C), 0)

    //   // A, B, C deposit
    //   await stabilityPool.provideToSP(dec(10000, 18), { from: A })
    //   await stabilityPool.provideToSP(dec(20000, 18), { from: B })
    //   await stabilityPool.provideToSP(dec(30000, 18), { from: C })

    //   await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.provideToSP(dec(20000, 18), { from: B })
    //   await stabilityPoolERC20.provideToSP(dec(30000, 18), { from: C })

    //   // One year passes
    //   await th.fastForwardTime(await getDuration(timeValues.SECONDS_IN_ONE_YEAR), web3.currentProvider)

    //   // D deposits, triggering PSY gains for A,B,C. Withdraws immediately after
    //   await stabilityPool.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPool.withdrawFromSP(dec(1, 18), { from: D })

    //   await stabilityPoolERC20.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPoolERC20.withdrawFromSP(dec(1, 18), { from: D })

    //   // Expected gains for each depositor after 1 year (50% total issued)
    //   const A_expectedPSYGain_1yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('6')) // A gets 1/6 of the issuance

    //   const B_expectedPSYGain_1yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_1yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   const A_expectedPSYGain_1yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('6')) // A gets 1/6 of the issuance

    //   const B_expectedPSYGain_1yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_1yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued after 1 year
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   // Check PSY gain
    //   const A_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_1yr = await stabilityPool.getDepositorPSYGain(C)

    //   const A_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(A)
    //   const B_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(B)
    //   const C_PSYGain_1yrERC20 = await stabilityPoolERC20.getDepositorPSYGain(C)

    //   // Check gains are correct, error tolerance = 1e-6 of a toke
    //   assert.isAtMost(getDifference(A_PSYGain_1yr, A_expectedPSYGain_1yr), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_1yr, B_expectedPSYGain_1yr), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_1yr, C_expectedPSYGain_1yr), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_1yrERC20, A_expectedPSYGain_1yrERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_1yrERC20, B_expectedPSYGain_1yrERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_1yrERC20, C_expectedPSYGain_1yrERC20), 1e12)

    //   // Another year passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    //   // D deposits, triggering PSY gains for A,B,C. Withdraws immediately after
    //   await stabilityPool.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPool.withdrawFromSP(dec(1, 18), { from: D })

    //   await stabilityPoolERC20.provideToSP(dec(1, 18), { from: D })
    //   await stabilityPoolERC20.withdrawFromSP(dec(1, 18), { from: D })

    //   // Expected gains for each depositor after 2 years (75% total issued).
    //   const A_expectedPSYGain_2yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('6')) // A gets 1/6 of the issuance

    //   const B_expectedPSYGain_2yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_2yr = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   // Expected gains for each depositor after 2 years (75% total issued).
    //   const A_expectedPSYGain_2yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('6')) // A gets 1/6 of the issuance

    //   const B_expectedPSYGain_2yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_2yrERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .mul(toBN('3'))
    //     .div(toBN('4')) // 75% of total issued after 1 year
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   // Check PSY gain
    //   const A_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_2yr = await stabilityPool.getDepositorPSYGain(C)

    //   const A_PSYGain_2yrERC20 = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_2yrERC20 = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_2yrERC20 = await stabilityPool.getDepositorPSYGain(C)

    //   // Check gains are correct, error tolerance = 1e-6 of a token
    //   assert.isAtMost(getDifference(A_PSYGain_2yr, A_expectedPSYGain_2yr), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_2yr, B_expectedPSYGain_2yr), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_2yr, C_expectedPSYGain_2yr), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_2yrERC20, A_expectedPSYGain_2yrERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_2yrERC20, B_expectedPSYGain_2yrERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_2yrERC20, C_expectedPSYGain_2yrERC20), 1e12)

    //   // Each depositor fully withdraws
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A })
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: B })
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: C })

    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: B })
    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: C })

    //   // Check PSY balances increase by correct amount
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(A), A_expectedPSYGain_2yr.add(A_expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(B), B_expectedPSYGain_2yr.add(B_expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(C), C_expectedPSYGain_2yr.add(C_expectedPSYGain_2yrERC20)),
    //     1e12
    //   )
    // })

    // // A, B, C deposit. Varied stake. 1 Liquidation. D joins.
    // it('withdrawFromSP(): Depositors with varying initial deposit withdraw correct PSY gain. No liquidations. No front end.', async () => {
    //   const initialIssuance = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.equal(initialIssuance, 0)

    //   const initialIssuanceERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.equal(initialIssuanceERC20, 0)

    //   // Whale opens Trove with 10k ETH
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), whale, whale, {
    //     from: whale,
    //     value: dec(10000, 'ether'),
    //   })

    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), A, A, {
    //     from: A,
    //     value: dec(200, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(20000, 18), B, B, {
    //     from: B,
    //     value: dec(300, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(30000, 18), C, C, {
    //     from: C,
    //     value: dec(400, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(40000, 18), D, D, {
    //     from: D,
    //     value: dec(500, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(40000, 18), E, E, {
    //     from: E,
    //     value: dec(600, 'ether'),
    //   })

    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(30000, 18)),
    //     defaulter_1,
    //     defaulter_1,
    //     { from: defaulter_1, value: dec(300, 'ether') }
    //   )

    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(10000, 'ether'),
    //     th._100pct,
    //     dec(10000, 18),
    //     whale,
    //     whale,
    //     { from: whale }
    //   )

    //   await borrowerOperations.openTrove(erc20.address, dec(200, 'ether'), th._100pct, dec(10000, 18), A, A, {
    //     from: A,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(300, 'ether'), th._100pct, dec(20000, 18), B, B, {
    //     from: B,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(400, 'ether'), th._100pct, dec(30000, 18), C, C, {
    //     from: C,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(500, 'ether'), th._100pct, dec(40000, 18), D, D, {
    //     from: D,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(600, 'ether'), th._100pct, dec(40000, 18), E, E, {
    //     from: E,
    //   })

    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(300, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(30000, 18)),
    //     defaulter_1,
    //     defaulter_1,
    //     { from: defaulter_1 }
    //   )

    //   // Check all PSY balances are initially 0
    //   assert.equal(await psyToken.balanceOf(A), 0)
    //   assert.equal(await psyToken.balanceOf(B), 0)
    //   assert.equal(await psyToken.balanceOf(C), 0)
    //   assert.equal(await psyToken.balanceOf(D), 0)

    //   // A, B, C deposit
    //   await stabilityPool.provideToSP(dec(10000, 18), { from: A })
    //   await stabilityPool.provideToSP(dec(20000, 18), { from: B })
    //   await stabilityPool.provideToSP(dec(30000, 18), { from: C })

    //   await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.provideToSP(dec(20000, 18), { from: B })
    //   await stabilityPoolERC20.provideToSP(dec(30000, 18), { from: C })

    //   // Year 1 passes
    //   await th.fastForwardTime(await getDuration(timeValues.SECONDS_IN_ONE_YEAR), web3.currentProvider)

    //   assert.equal(await stabilityPool.getTotalSLSDDeposits(), dec(60000, 18))
    //   assert.equal(await stabilityPoolERC20.getTotalSLSDDeposits(), dec(60000, 18))

    //   // Price Drops, defaulter1 liquidated. Stability Pool size drops by 50%
    //   await priceFeed.setPrice(dec(100, 18))
    //   assert.isFalse(await th.checkRecoveryMode(contracts))
    //   assert.isFalse(await th.checkRecoveryMode(contracts, erc20.address))

    //   await troveManager.liquidate(ZERO_ADDRESS, defaulter_1)
    //   await troveManager.liquidate(erc20.address, defaulter_1)
    //   assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_1))
    //   assert.isFalse(await sortedTroves.contains(erc20.address, defaulter_1))

    //   // Confirm SP dropped from 60k to 30k
    //   assert.isAtMost(getDifference(await stabilityPool.getTotalSLSDDeposits(), dec(30000, 18)), 1000)
    //   assert.isAtMost(getDifference(await stabilityPoolERC20.getTotalSLSDDeposits(), dec(30000, 18)), 1000)

    //   // Expected gains for each depositor after 1 year (50% total issued)
    //   const A_expectedPSYGain_Y1 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('6')) // A got 1/6 of the issuance

    //   const B_expectedPSYGain_Y1 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_Y1 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   const A_expectedPSYGain_Y1ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('6')) // A got 1/6 of the issuance

    //   const B_expectedPSYGain_Y1ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('3')) // B gets 2/6 = 1/3 of the issuance

    //   const C_expectedPSYGain_Y1ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('2')) // 50% of total issued in Y1
    //     .div(toBN('2')) // C gets 3/6 = 1/2 of the issuance

    //   // Check PSY gain
    //   const A_PSYGain_Y1 = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_Y1 = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_Y1 = await stabilityPool.getDepositorPSYGain(C)

    //   const A_PSYGain_Y1ERC20 = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_Y1ERC20 = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_Y1ERC20 = await stabilityPool.getDepositorPSYGain(C)

    //   // Check gains are correct, error tolerance = 1e-6 of a toke
    //   assert.isAtMost(getDifference(A_PSYGain_Y1, A_expectedPSYGain_Y1), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_Y1, B_expectedPSYGain_Y1), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_Y1, C_expectedPSYGain_Y1), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_Y1ERC20, A_expectedPSYGain_Y1ERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_Y1ERC20, B_expectedPSYGain_Y1ERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_Y1ERC20, C_expectedPSYGain_Y1ERC20), 1e12)

    //   // D deposits 40k
    //   await stabilityPool.provideToSP(dec(40000, 18), { from: D })
    //   await stabilityPoolERC20.provideToSP(dec(40000, 18), { from: D })

    //   // Year 2 passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    //   // E deposits and withdraws, creating PSY issuance
    //   await stabilityPool.provideToSP(dec(1, 18), { from: E })
    //   await stabilityPool.withdrawFromSP(dec(1, 18), { from: E })

    //   await stabilityPoolERC20.provideToSP(dec(1, 18), { from: E })
    //   await stabilityPoolERC20.withdrawFromSP(dec(1, 18), { from: E })

    //   // Expected gains for each depositor during Y2:
    //   const A_expectedPSYGain_Y2 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .div(toBN('14')) // A got 50/700 = 1/14 of the issuance

    //   const B_expectedPSYGain_Y2 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .div(toBN('7')) // B got 100/700 = 1/7 of the issuance

    //   const C_expectedPSYGain_Y2 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .mul(toBN('3'))
    //     .div(toBN('14')) // C gets 150/700 = 3/14 of the issuance

    //   const D_expectedPSYGain_Y2 = (await communityIssuanceTester.PSYSupplyCaps(stabilityPool.address))
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .mul(toBN('4'))
    //     .div(toBN('7')) // D gets 400/700 = 4/7 of the issuance

    //   // Expected gains for each depositor during Y2:
    //   const A_expectedPSYGain_Y2ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .div(toBN('14')) // A got 50/700 = 1/14 of the issuance

    //   const B_expectedPSYGain_Y2ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .div(toBN('7')) // B got 100/700 = 1/7 of the issuance

    //   const C_expectedPSYGain_Y2ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .mul(toBN('3'))
    //     .div(toBN('14')) // C gets 150/700 = 3/14 of the issuance

    //   const D_expectedPSYGain_Y2ERC20 = (
    //     await communityIssuanceTester.PSYSupplyCaps(stabilityPoolERC20.address)
    //   )
    //     .div(toBN('4')) // 25% of total issued in Y2
    //     .mul(toBN('4'))
    //     .div(toBN('7')) // D gets 400/700 = 4/7 of the issuance

    //   // Check PSY gain
    //   const A_PSYGain_AfterY2 = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_AfterY2 = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_AfterY2 = await stabilityPool.getDepositorPSYGain(C)
    //   const D_PSYGain_AfterY2 = await stabilityPool.getDepositorPSYGain(D)

    //   const A_PSYGain_AfterY2ERC20 = await stabilityPool.getDepositorPSYGain(A)
    //   const B_PSYGain_AfterY2ERC20 = await stabilityPool.getDepositorPSYGain(B)
    //   const C_PSYGain_AfterY2ERC20 = await stabilityPool.getDepositorPSYGain(C)
    //   const D_PSYGain_AfterY2ERC20 = await stabilityPool.getDepositorPSYGain(D)

    //   const A_expectedTotalGain = A_expectedPSYGain_Y1.add(A_expectedPSYGain_Y2)
    //   const B_expectedTotalGain = B_expectedPSYGain_Y1.add(B_expectedPSYGain_Y2)
    //   const C_expectedTotalGain = C_expectedPSYGain_Y1.add(C_expectedPSYGain_Y2)
    //   const D_expectedTotalGain = D_expectedPSYGain_Y2

    //   const A_expectedTotalGainERC20 = A_expectedPSYGain_Y1ERC20.add(A_expectedPSYGain_Y2ERC20)
    //   const B_expectedTotalGainERC20 = B_expectedPSYGain_Y1ERC20.add(B_expectedPSYGain_Y2ERC20)
    //   const C_expectedTotalGainERC20 = C_expectedPSYGain_Y1ERC20.add(C_expectedPSYGain_Y2ERC20)
    //   const D_expectedTotalGainERC20 = D_expectedPSYGain_Y2ERC20

    //   // Check gains are correct, error tolerance = 1e-6 of a token
    //   assert.isAtMost(getDifference(A_PSYGain_AfterY2, A_expectedTotalGain), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_AfterY2, B_expectedTotalGain), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_AfterY2, C_expectedTotalGain), 1e12)
    //   assert.isAtMost(getDifference(D_PSYGain_AfterY2, D_expectedTotalGain), 1e12)

    //   assert.isAtMost(getDifference(A_PSYGain_AfterY2ERC20, A_expectedTotalGainERC20), 1e12)
    //   assert.isAtMost(getDifference(B_PSYGain_AfterY2ERC20, B_expectedTotalGainERC20), 1e12)
    //   assert.isAtMost(getDifference(C_PSYGain_AfterY2ERC20, C_expectedTotalGainERC20), 1e12)
    //   assert.isAtMost(getDifference(D_PSYGain_AfterY2ERC20, D_expectedTotalGainERC20), 1e12)

    //   // Each depositor fully withdraws
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A })
    //   await stabilityPool.withdrawFromSP(dec(20000, 18), { from: B })
    //   await stabilityPool.withdrawFromSP(dec(30000, 18), { from: C })
    //   await stabilityPool.withdrawFromSP(dec(40000, 18), { from: D })

    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.withdrawFromSP(dec(20000, 18), { from: B })
    //   await stabilityPoolERC20.withdrawFromSP(dec(30000, 18), { from: C })
    //   await stabilityPoolERC20.withdrawFromSP(dec(40000, 18), { from: D })

    //   // Check PSY balances increase by correct amount
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(A), A_expectedTotalGain.add(A_expectedTotalGainERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(B), B_expectedTotalGain.add(B_expectedTotalGainERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(C), C_expectedTotalGain.add(C_expectedTotalGainERC20)),
    //     1e12
    //   )
    //   assert.isAtMost(
    //     getDifference(await psyToken.balanceOf(D), D_expectedTotalGain.add(D_expectedTotalGainERC20)),
    //     1e12
    //   )
    // })

    // //--- Serial pool-emptying liquidations ---

    // /* A, B deposit 100C
    // L1 cancels 200C
    // B, C deposits 100C
    // L2 cancels 200C
    // E, F deposit 100C
    // L3 cancels 200C
    // G,H deposits 100C
    // L4 cancels 200C

    // Expect all depositors withdraw  1/2 of 1 month's PSY issuance */
    // it('withdrawFromSP(): Depositor withdraws correct PSY gain after serial pool-emptying liquidations. No front-ends.', async () => {
    //   const initialIssuance = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.equal(initialIssuance, 0)

    //   const initialIssuanceERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.equal(initialIssuanceERC20, 0)

    //   // Whale opens Trove with 10k ETH
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(10000, 18)),
    //     whale,
    //     whale,
    //     { from: whale, value: dec(10000, 'ether') }
    //   )
    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(10000, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(10000, 18)),
    //     whale,
    //     whale,
    //     { from: whale }
    //   )

    //   const allDepositors = [A, B, C, D, E, F, G, H]
    //   // 4 Defaulters open trove with 200SLSD debt, and 200% ICR
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_1,
    //     defaulter_1,
    //     { from: defaulter_1, value: dec(200, 'ether') }
    //   )
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_2,
    //     defaulter_2,
    //     { from: defaulter_2, value: dec(200, 'ether') }
    //   )
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_3,
    //     defaulter_3,
    //     { from: defaulter_3, value: dec(200, 'ether') }
    //   )
    //   await borrowerOperations.openTrove(
    //     ZERO_ADDRESS,
    //     0,
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_4,
    //     defaulter_4,
    //     { from: defaulter_4, value: dec(200, 'ether') }
    //   )

    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(200, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_1,
    //     defaulter_1,
    //     { from: defaulter_1 }
    //   )
    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(200, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_2,
    //     defaulter_2,
    //     { from: defaulter_2 }
    //   )
    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(200, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_3,
    //     defaulter_3,
    //     { from: defaulter_3 }
    //   )
    //   await borrowerOperations.openTrove(
    //     erc20.address,
    //     dec(200, 'ether'),
    //     th._100pct,
    //     await getOpenTroveSLSDAmount(dec(20000, 18)),
    //     defaulter_4,
    //     defaulter_4,
    //     { from: defaulter_4 }
    //   )

    //   // price drops by 50%: defaulter ICR falls to 100%
    //   await priceFeed.setPrice(dec(100, 18))

    //   // Check all would-be depositors have 0 PSY balance
    //   for (depositor of allDepositors) {
    //     assert.equal(await psyToken.balanceOf(depositor), '0')
    //   }

    //   // A, B each deposit 10k SLSD
    //   const depositors_1 = [A, B]
    //   for (account of depositors_1) {
    //     await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), account, account, {
    //       from: account,
    //       value: dec(200, 'ether'),
    //     })
    //     await borrowerOperations.openTrove(
    //       erc20.address,
    //       dec(200, 'ether'),
    //       th._100pct,
    //       dec(10000, 18),
    //       account,
    //       account,
    //       { from: account }
    //     )
    //     await stabilityPool.provideToSP(dec(10000, 18), { from: account })
    //     await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: account })
    //   }

    //   // 1 month passes
    //   await th.fastForwardTime(await getDuration(timeValues.SECONDS_IN_ONE_PSYTH), web3.currentProvider)

    //   // Defaulter 1 liquidated. 20k SLSD fully offset with pool.
    //   await troveManager.liquidate(ZERO_ADDRESS, defaulter_1, { from: owner })
    //   await troveManager.liquidate(erc20.address, defaulter_1, { from: owner })

    //   // C, D each deposit 10k SLSD
    //   const depositors_2 = [C, D]
    //   for (account of depositors_2) {
    //     await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), account, account, {
    //       from: account,
    //       value: dec(200, 'ether'),
    //     })
    //     await borrowerOperations.openTrove(
    //       erc20.address,
    //       dec(200, 'ether'),
    //       th._100pct,
    //       dec(10000, 18),
    //       account,
    //       account,
    //       { from: account }
    //     )

    //     await stabilityPool.provideToSP(dec(10000, 18), { from: account })
    //     await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: account })
    //   }

    //   // 1 month passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // Defaulter 2 liquidated. 10k SLSD offset
    //   await troveManager.liquidate(ZERO_ADDRESS, defaulter_2, { from: owner })
    //   await troveManager.liquidate(erc20.address, defaulter_2, { from: owner })

    //   // Erin, Flyn each deposit 100 SLSD
    //   const depositors_3 = [E, F]
    //   for (account of depositors_3) {
    //     await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), account, account, {
    //       from: account,
    //       value: dec(200, 'ether'),
    //     })
    //     await borrowerOperations.openTrove(
    //       erc20.address,
    //       dec(200, 'ether'),
    //       th._100pct,
    //       dec(10000, 18),
    //       account,
    //       account,
    //       { from: account }
    //     )

    //     await stabilityPool.provideToSP(dec(10000, 18), { from: account })
    //     await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: account })
    //   }

    //   // 1 month passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // Defaulter 3 liquidated. 100 SLSD offset
    //   await troveManager.liquidate(ZERO_ADDRESS, defaulter_3, { from: owner })
    //   await troveManager.liquidate(erc20.address, defaulter_3, { from: owner })

    //   // Graham, Harriet each deposit 10k SLSD
    //   const depositors_4 = [G, H]
    //   for (account of depositors_4) {
    //     await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), account, account, {
    //       from: account,
    //       value: dec(200, 'ether'),
    //     })
    //     await borrowerOperations.openTrove(
    //       erc20.address,
    //       dec(200, 'ether'),
    //       th._100pct,
    //       dec(10000, 18),
    //       account,
    //       account,
    //       { from: account }
    //     )

    //     await stabilityPool.provideToSP(dec(10000, 18), { from: account })
    //     await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: account })
    //   }

    //   // 1 month passes
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // Defaulter 4 liquidated. 100 SLSD offset
    //   await troveManager.liquidate(ZERO_ADDRESS, defaulter_4, { from: owner })
    //   await troveManager.liquidate(erc20.address, defaulter_4, { from: owner })

    //   // All depositors withdraw from SP
    //   for (depositor of allDepositors) {
    //     await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor })
    //     await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: depositor })
    //   }

    //   /* Each depositor constitutes 50% of the pool from the time they deposit, up until the liquidation.
    //   Therefore, divide monthly issuance by 2 to get the expected per-depositor PSY gain.*/
    //   //x2 since we are doing two collateral in one test
    //   const expectedPSYGain_M1 = issuance_M1.div(th.toBN('2')).mul(toBN(2))
    //   const expectedPSYGain_M2 = issuance_M2.div(th.toBN('2')).mul(toBN(2))
    //   const expectedPSYGain_M3 = issuance_M3.div(th.toBN('2')).mul(toBN(2))
    //   const expectedPSYGain_M4 = issuance_M4.div(th.toBN('2')).mul(toBN(2))

    //   // Check A, B only earn issuance from month 1. Error tolerance = 1e-3 tokens
    //   for (depositor of [A, B]) {
    //     const PSYBalance = await psyToken.balanceOf(depositor)
    //     assert.isAtMost(getDifference(PSYBalance, expectedPSYGain_M1), 1e15)
    //   }

    //   // Check C, D only earn issuance from month 2.  Error tolerance = 1e-3 tokens
    //   for (depositor of [C, D]) {
    //     const PSYBalance = await psyToken.balanceOf(depositor)
    //     assert.isAtMost(getDifference(PSYBalance, expectedPSYGain_M2), 1e15)
    //   }

    //   // Check E, F only earn issuance from month 3.  Error tolerance = 1e-3 tokens
    //   for (depositor of [E, F]) {
    //     const PSYBalance = await psyToken.balanceOf(depositor)
    //     assert.isAtMost(getDifference(PSYBalance, expectedPSYGain_M3), 1e15)
    //   }

    //   // Check G, H only earn issuance from month 4.  Error tolerance = 1e-3 tokens
    //   for (depositor of [G, H]) {
    //     const PSYBalance = await psyToken.balanceOf(depositor)
    //     assert.isAtMost(getDifference(PSYBalance, expectedPSYGain_M4), 1e15)
    //   }

    //   const finalEpoch = (await stabilityPool.currentEpoch()).toString()
    //   assert.equal(finalEpoch, 4)

    //   const finalEpochERC20 = (await stabilityPoolERC20.currentEpoch()).toString()
    //   assert.equal(finalEpochERC20, 4)
    // })

    // it('PSY issuance for a given period is not obtainable if the SP was empty during the period', async () => {
    //   const CIBalanceBefore = await psyToken.balanceOf(communityIssuanceTester.address)

    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(16000, 18), A, A, {
    //     from: A,
    //     value: dec(200, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(10000, 18), B, B, {
    //     from: B,
    //     value: dec(100, 'ether'),
    //   })
    //   await borrowerOperations.openTrove(ZERO_ADDRESS, 0, th._100pct, dec(16000, 18), C, C, {
    //     from: C,
    //     value: dec(200, 'ether'),
    //   })

    //   await borrowerOperations.openTrove(erc20.address, dec(200, 'ether'), th._100pct, dec(16000, 18), A, A, {
    //     from: A,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(100, 'ether'), th._100pct, dec(10000, 18), B, B, {
    //     from: B,
    //   })
    //   await borrowerOperations.openTrove(erc20.address, dec(200, 'ether'), th._100pct, dec(16000, 18), C, C, {
    //     from: C,
    //   })

    //   const totalPSYissuance_0 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   const G_0 = await stabilityPool.epochToScaleToG(0, 0) // epochs and scales will not change in this test: no liquidations
    //   assert.equal(totalPSYissuance_0, '0')
    //   assert.equal(G_0, '0')

    //   const totalPSYissuance_0ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   const G_0ERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0) // epochs and scales will not change in this test: no liquidations
    //   assert.equal(totalPSYissuance_0ERC20, '0')
    //   assert.equal(G_0ERC20, '0')

    //   // 1 month passes (M1)
    //   await th.fastForwardTime(await getDuration(timeValues.SECONDS_IN_ONE_PSYTH), web3.currentProvider)

    //   // PSY issuance event triggered: A deposits
    //   await stabilityPool.provideToSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: A })

    //   // Check G is not updated, since SP was empty prior to A's deposit
    //   const G_1 = await stabilityPool.epochToScaleToG(0, 0)
    //   assert.isTrue(G_1.eq(G_0))

    //   const G_1ERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
    //   assert.isTrue(G_1ERC20.eq(G_0ERC20))

    //   // Check total PSY issued is updated
    //   const totalPSYissuance_1 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.isTrue(totalPSYissuance_1.gt(totalPSYissuance_0))

    //   const totalPSYissuance_1ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.isTrue(totalPSYissuance_1ERC20.gt(totalPSYissuance_0ERC20))

    //   // 1 month passes (M2)
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // PSY issuance event triggered: A withdraws.
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: A })
    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: A })

    //   // Check G is updated, since SP was not empty prior to A's withdrawal
    //   const G_2 = await stabilityPool.epochToScaleToG(0, 0)
    //   assert.isTrue(G_2.gt(G_1))

    //   const G_2ERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
    //   assert.isTrue(G_2ERC20.gt(G_1ERC20))

    //   // Check total PSY issued is updated
    //   const totalPSYissuance_2 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.isTrue(totalPSYissuance_2.gt(totalPSYissuance_1))

    //   const totalPSYissuance_2ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.isTrue(totalPSYissuance_2ERC20.gt(totalPSYissuance_1ERC20))

    //   // 1 month passes (M3)
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // PSY issuance event triggered: C deposits
    //   await stabilityPool.provideToSP(dec(10000, 18), { from: C })
    //   await stabilityPoolERC20.provideToSP(dec(10000, 18), { from: C })

    //   // Check G is not updated, since SP was empty prior to C's deposit
    //   const G_3 = await stabilityPool.epochToScaleToG(0, 0)
    //   assert.isTrue(G_3.eq(G_2))

    //   const G_3ERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
    //   assert.isTrue(G_3ERC20.eq(G_2ERC20))

    //   // Check total PSY issued is updated
    //   const totalPSYissuance_3 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.isTrue(totalPSYissuance_3.gt(totalPSYissuance_2))

    //   const totalPSYissuance_3ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.isTrue(totalPSYissuance_3ERC20.gt(totalPSYissuance_2ERC20))

    //   // 1 month passes (M4)
    //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

    //   // C withdraws
    //   await stabilityPool.withdrawFromSP(dec(10000, 18), { from: C })
    //   await stabilityPoolERC20.withdrawFromSP(dec(10000, 18), { from: C })

    //   // Check G is increased, since SP was not empty prior to C's withdrawal
    //   const G_4 = await stabilityPool.epochToScaleToG(0, 0)
    //   assert.isTrue(G_4.gt(G_3))

    //   const G_4ERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
    //   assert.isTrue(G_4ERC20.gt(G_3ERC20))

    //   // Check total PSY issued is increased
    //   const totalPSYissuance_4 = await communityIssuanceTester.totalPSYIssued(stabilityPool.address)
    //   assert.isTrue(totalPSYissuance_4.gt(totalPSYissuance_3))

    //   const totalPSYissuance_4ERC20 = await communityIssuanceTester.totalPSYIssued(stabilityPoolERC20.address)
    //   assert.isTrue(totalPSYissuance_4ERC20.gt(totalPSYissuance_3ERC20))

    //   // Get PSY Gains
    //   const A_PSYGain = await psyToken.balanceOf(A)
    //   const C_PSYGain = await psyToken.balanceOf(C)

    //   // Check A earns gains from M2 only
    //   assert.isAtMost(getDifference(A_PSYGain, issuance_M2.mul(toBN(2))), 1e15)

    //   // Check C earns gains from M4 only
    //   assert.isAtMost(getDifference(C_PSYGain, issuance_M4.mul(toBN(2))), 1e15)

    //   // Check totalPSYIssued = M1 + M2 + M3 + M4.  1e-3 error tolerance.
    //   const expectedIssuance4Months = issuance_M1.add(issuance_M2).add(issuance_M3).add(issuance_M4)
    //   assert.isAtMost(getDifference(expectedIssuance4Months, totalPSYissuance_4), 1e15)

    //   // Check CI has only transferred out tokens for M2 + M4.  1e-3 error tolerance.
    //   const expectedPSYSentOutFromCI = issuance_M2.add(issuance_M4)
    //   const CIBalanceAfter = await psyToken.balanceOf(communityIssuanceTester.address)
    //   const CIBalanceDifference = CIBalanceBefore.sub(CIBalanceAfter)
    //   assert.isAtMost(getDifference(CIBalanceDifference, expectedPSYSentOutFromCI.mul(toBN(2))), 1e15)
    // })

    // --- Scale factor changes ---

    /* Serial scale changes

    A make deposit 10k SLSD
    1 month passes. L1 decreases P: P = 1e-5 P. L1:   9999.9 SLSD, 100 ETH
    B makes deposit 9999.9
    1 month passes. L2 decreases P: P =  1e-5 P. L2:  9999.9 SLSD, 100 ETH
    C makes deposit  9999.9
    1 month passes. L3 decreases P: P = 1e-5 P. L3:  9999.9 SLSD, 100 ETH
    D makes deposit  9999.9
    1 month passes. L4 decreases P: P = 1e-5 P. L4:  9999.9 SLSD, 100 ETH
    E makes deposit  9999.9
    1 month passes. L5 decreases P: P = 1e-5 P. L5:  9999.9 SLSD, 100 ETH
    =========
    F makes deposit 100
    1 month passes. L6 empties the Pool. L6:  10000 SLSD, 100 ETH

    expect A, B, C, D each withdraw ~1 month's worth of PSY */
    it('withdrawFromSP(): Several deposits of 100 SLSD span one scale factor change. Depositors withdraw correct PSY gains', async () => {
      // Whale opens Trove with 100 ETH
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(100, 'ether') }
      )

      const fiveDefaulters = [defaulter_1, defaulter_2, defaulter_3, defaulter_4, defaulter_5]

      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: A, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: B, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: C, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: D, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: E, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: F, value: dec(10000, 'ether') }
      )

      for (const defaulter of fiveDefaulters) {
        // Defaulters 1-5 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations.openTrove(
          ZERO_ADDRESS,
          0,
          th._100pct,
          await getOpenTroveSLSDAmount('9999900000000000000000'),
          defaulter,
          defaulter,
          { from: defaulter, value: dec(100, 'ether') }
        )
      }

      // Defaulter 6 withdraws to 10k debt (inc. gas comp)
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        defaulter_6,
        defaulter_6,
        { from: defaulter_6, value: dec(100, 'ether') }
      )

      // Confirm all depositors have 0 PSY
      for (const depositor of [A, B, C, D, E, F]) {
        assert.equal(await psyToken.balanceOf(depositor), '0')
      }
      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18))

      // Check scale is 0
      // assert.equal(await stabilityPool.currentScale(), '0')

      // A provides to SP
      await stabilityPool.provideToSP(dec(10000, 18), { from: A })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 1 liquidated. Value of P updated to 1e-5
      const txL1 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_1, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_1))
      assert.isTrue(txL1.receipt.status)

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), '0')
      assert.equal(await stabilityPool.P(), dec(1, 13)) // P decreases: P = 1e(18-5) = 1e13

      // B provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: B })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_2, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_2))
      assert.isTrue(txL2.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 17)) //Scale changes and P changes: P = 1e(13-5+9) = 1e17

      // C provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: C })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_3, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_3))
      assert.isTrue(txL3.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 12)) //P decreases: P 1e(17-5) = 1e12

      // D provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: D })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 4 liquidated
      const txL4 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_4, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_4))
      assert.isTrue(txL4.receipt.status)

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), '2')
      assert.equal(await stabilityPool.P(), dec(1, 16)) //Scale changes and P changes:: P = 1e(12-5+9) = 1e16

      // E provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: E })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 5 liquidated
      const txL5 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_5, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_5))
      assert.isTrue(txL5.receipt.status)

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), '2')
      assert.equal(await stabilityPool.P(), dec(1, 11)) // P decreases: P = 1e(16-5) = 1e11

      // F provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: F })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      assert.equal(await stabilityPool.currentEpoch(), '0')

      // Defaulter 6 liquidated
      const txL6 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_6, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_6))
      assert.isTrue(txL6.receipt.status)

      // Check scale is 0, epoch is 1
      assert.equal(await stabilityPool.currentScale(), '0')
      assert.equal(await stabilityPool.currentEpoch(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 18)) // P resets to 1e18 after pool-emptying

      // price doubles
      await priceFeed.setPrice(dec(200, 18))

      /* All depositors withdraw fully from SP.  Withdraw in reverse order, so that the largest remaining
      deposit (F) withdraws first, and does not get extra PSY gains from the periods between withdrawals */
      for (depositor of [F, E, D, C, B, A]) {
        await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor })
      }

      const PSYGain_A = await psyToken.balanceOf(A)
      const PSYGain_B = await psyToken.balanceOf(B)
      const PSYGain_C = await psyToken.balanceOf(C)
      const PSYGain_D = await psyToken.balanceOf(D)
      const PSYGain_E = await psyToken.balanceOf(E)
      const PSYGain_F = await psyToken.balanceOf(F)

      // The timespam in a blockchain is a little bit different, which is why we are allowing 20 tokens of difference for the tests
      // This won't be an issue on the mainnet
      const expectedGain = issuance_M1 // using M1 assurance since technically this is splitted between 6 personnes, so 6M / 6 = 1M

      assert.isAtMost(getDifference(expectedGain, PSYGain_A), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_B), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_C), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_D), 20e18)

      assert.isAtMost(getDifference(expectedGain, PSYGain_E), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_F), 20e18)
    })

    // COPY PASTE FROM THE LAST TO TEST ONE THING, IM IN A RUSH< PLEASE DONT JUDGE
    it('withdrawFromSP(): Several deposits of 100 SLSD span one scale factor change. Depositors withdraw correct PSY gains and set distributrion at zero', async () => {
      // Whale opens Trove with 100 ETH
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(100, 'ether') }
      )

      const fiveDefaulters = [defaulter_1, defaulter_2, defaulter_3, defaulter_4, defaulter_5]

      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: A, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: B, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: C, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: D, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: E, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: F, value: dec(10000, 'ether') }
      )

      for (const defaulter of fiveDefaulters) {
        // Defaulters 1-5 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations.openTrove(
          ZERO_ADDRESS,
          0,
          th._100pct,
          await getOpenTroveSLSDAmount('9999900000000000000000'),
          defaulter,
          defaulter,
          { from: defaulter, value: dec(100, 'ether') }
        )
      }

      // Defaulter 6 withdraws to 10k debt (inc. gas comp)
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        defaulter_6,
        defaulter_6,
        { from: defaulter_6, value: dec(100, 'ether') }
      )

      // Confirm all depositors have 0 PSY
      for (const depositor of [A, B, C, D, E, F]) {
        assert.equal(await psyToken.balanceOf(depositor), '0')
      }
      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18))

      // Check scale is 0
      // assert.equal(await stabilityPool.currentScale(), '0')

      // A provides to SP
      await stabilityPool.provideToSP(dec(10000, 18), { from: A })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 1 liquidated.  Value of P updated to 1e-5
      const txL1 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_1, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_1))
      assert.isTrue(txL1.receipt.status)

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), '0')
      assert.equal(await stabilityPool.P(), dec(1, 13)) //P decreases: P = 1e(18-5) = 1e13

      // B provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: B })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_2, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_2))
      assert.isTrue(txL2.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 17)) // Scale changes and P changes: P = 1e(13-5+9) = 1e17

      // C provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: C })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_3, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_3))
      assert.isTrue(txL3.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 12)) // P decreases: P 1e(17-5) = 1e12

      // D provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: D })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 4 liquidated
      const txL4 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_4, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_4))
      assert.isTrue(txL4.receipt.status)

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), '2')
      assert.equal(await stabilityPool.P(), dec(1, 16)) // Scale changes and P changes: P = 1e(12-5+9) = 1e16

      // E provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: E })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 5 liquidated
      const txL5 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_5, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_5))
      assert.isTrue(txL5.receipt.status)

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), '2')
      assert.equal(await stabilityPool.P(), dec(1, 11)) // P decreases: P = 1e(16-5) = 1e11

      // F provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: F })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      assert.equal(await stabilityPool.currentEpoch(), '0')

      // Defaulter 6 liquidated
      const txL6 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_6, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_6))
      assert.isTrue(txL6.receipt.status)

      // Check scale is 0, epoch is 1
      assert.equal(await stabilityPool.currentScale(), '0')
      assert.equal(await stabilityPool.currentEpoch(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 18)) // P resets to 1e18 after pool-emptying

      // price doubles
      await priceFeed.setPrice(dec(200, 18))

      /* All depositors withdraw fully from SP.  Withdraw in reverse order, so that the largest remaining
      deposit (F) withdraws first, and does not get extra PSY gains from the periods between withdrawals */
      for (depositor of [F, E, D]) {
        await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor })
      }

      // SET Distribution to zero,
      await communityIssuanceTester.setWeeklyPSYDistribution(stabilityPool.address, 0)

      for (depositor of [C, B, A]) {
        await stabilityPool.withdrawFromSP(dec(10000, 18), { from: depositor })
      }

      const PSYGain_A = await psyToken.balanceOf(A)
      const PSYGain_B = await psyToken.balanceOf(B)
      const PSYGain_C = await psyToken.balanceOf(C)
      const PSYGain_D = await psyToken.balanceOf(D)
      const PSYGain_E = await psyToken.balanceOf(E)
      const PSYGain_F = await psyToken.balanceOf(F)

      // The timespam in a blockchain is a little bit different, which is why we are allowing 20 tokens of difference for the tests
      // This won't be an issue on the mainnet
      const expectedGain = issuance_M1 // using M1 assurance since technically this is splitted between 6 personnes, so 6M / 6 = 1M

      assert.isAtMost(getDifference(expectedGain, PSYGain_A), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_B), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_C), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_D), 20e18)

      assert.isAtMost(getDifference(expectedGain, PSYGain_E), 20e18)
      assert.isAtMost(getDifference(expectedGain, PSYGain_F), 20e18)
    })

    it('withdrawFromSP(): Play with settings', async () => {
      // Whale opens Trove with 100 ETH
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        whale,
        whale,
        { from: whale, value: dec(100, 'ether') }
      )

      const fiveDefaulters = [defaulter_1, defaulter_2, defaulter_3, defaulter_4, defaulter_5]

      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: A, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: B, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: C, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: D, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: E, value: dec(10000, 'ether') }
      )
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        dec(10000, 18),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { from: F, value: dec(10000, 'ether') }
      )

      for (const defaulter of fiveDefaulters) {
        // Defaulters 1-5 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations.openTrove(
          ZERO_ADDRESS,
          0,
          th._100pct,
          await getOpenTroveSLSDAmount('9999900000000000000000'),
          defaulter,
          defaulter,
          { from: defaulter, value: dec(100, 'ether') }
        )
      }

      // Defaulter 6 withdraws to 10k debt (inc. gas comp)
      await borrowerOperations.openTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        await getOpenTroveSLSDAmount(dec(10000, 18)),
        defaulter_6,
        defaulter_6,
        { from: defaulter_6, value: dec(100, 'ether') }
      )

      // Confirm all depositors have 0 PSY
      for (const depositor of [A, B, C, D, E, F]) {
        assert.equal(await psyToken.balanceOf(depositor), '0')
      }
      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18))

      // Check scale is 0
      // assert.equal(await stabilityPool.currentScale(), '0')

      // A provides to SP
      await stabilityPool.provideToSP(dec(10000, 18), { from: A })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 1 liquidated. Value of P updated to 1e-5
      const txL1 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_1, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_1))
      assert.isTrue(txL1.receipt.status)

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), '0')
      assert.equal(await stabilityPool.P(), dec(1, 13)) // P decreases: P = 1e(18-5) = 1e13

      // B provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: B })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_2, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_2))
      assert.isTrue(txL2.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 17)) // Scale changes and P changes: P = 1e(13-5+9) = 1e17

      // C provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: C })
      await communityIssuanceTester.setWeeklyPSYDistribution(stabilityPool.address, 0)

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(ZERO_ADDRESS, defaulter_3, { from: owner })
      assert.isFalse(await sortedTroves.contains(ZERO_ADDRESS, defaulter_3))
      assert.isTrue(txL3.receipt.status)

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), '1')
      assert.equal(await stabilityPool.P(), dec(1, 12)) // P decreases: P 1e(17-5) = 1e12

      // D provides to SP
      await stabilityPool.provideToSP(dec(99999, 17), { from: D })

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)
    })
  })
})

contract('Reset chain state', async (accounts) => {})
