const deploymentHelper = require('../utils/deploymentHelpers.js')
const testHelpers = require('../utils/testHelpers.js')

const BorrowerOperationsTester = artifacts.require('./BorrowerOperationsTester.sol')
const NonPayable = artifacts.require('NonPayable.sol')
const TroveManagerTester = artifacts.require('TroveManagerTester')
const TroveManagerHelpersTester = artifacts.require('TroveManagerHelpersTester')
const StabilityPool = artifacts.require('./StabilityPool.sol')

const th = testHelpers.TestHelper
const dec = th.dec
const toBN = th.toBN
const mv = testHelpers.MoneyValues
const timeValues = testHelpers.TimeValues

const ZERO_ADDRESS = th.ZERO_ADDRESS
const assertRevert = th.assertRevert

/*
 * NOTE: Some of the borrowing tests do not test for specific SLSD fee values. They only test that the
 * fees are non-zero when they should occur, and that they decay over time.
 *
 * Specific SLSD fee values will depend on the final fee schedule used, and the final choice for
 * the parameter MINUTE_DECAY_FACTOR in the TroveManager, which is still TBD based on economic
 * modelling.
 */

contract('Deploy and operation tests when PSY token is launched later', async (accounts) => {
  const [owner, alice, fakeIndex, fakeOracle, whale, treasury, A, B, C, defaulter_1, E, F, G, H] = accounts

  const [multisig] = accounts.slice(997, 1000)

  let priceFeed
  let slsdToken
  let sortedTroves
  let troveManager
  let troveManagerHelpers
  let activePool
  let defaultPool
  let communityIssuance
  let borrowerOperations
  let psyStaking
  let psyToken
  let psyParams
  let erc20
  
  let PSYContracts
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

  const testCorpus = ({ withProxy = false }) => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployLiquityCore()
      contracts.borrowerOperations = await BorrowerOperationsTester.new()
      contracts.troveManager = await TroveManagerTester.new()
      contracts.troveManagerHelpers = await TroveManagerHelpersTester.new()
      contracts = await deploymentHelper.deploySLSDToken(contracts)

      await deploymentHelper.connectContractsWithoutPSY(contracts,treasury)
      
      PSYContracts = await deploymentHelper.deployPSYContractsHardhat(accounts[0])
    
      priceFeed = contracts.priceFeedTestnet
      slsdToken = contracts.slsdToken
      sortedTroves = contracts.sortedTroves
      troveManager = contracts.troveManager
      troveManagerHelpers = contracts.troveManagerHelpers
      activePool = contracts.activePool
      defaultPool = contracts.defaultPool
      borrowerOperations = contracts.borrowerOperations
      hintHelpers = contracts.hintHelpers
      psyParams = contracts.psyParameters
      adminContract = contracts.adminContract

      psyStaking = PSYContracts.psyStaking
      psyToken = PSYContracts.psyToken
      communityIssuance = PSYContracts.communityIssuance
      erc20 = contracts.erc20

      stabilityPoolManager = contracts.stabilityPoolManager
    
      console.log('a')
      await psyParams.sanitizeParameters(ZERO_ADDRESS)
      await psyParams.sanitizeParameters(erc20.address)

      SLSD_GAS_COMPENSATION = await psyParams.SLSD_GAS_COMPENSATION(ZERO_ADDRESS)
      MIN_NET_DEBT = await psyParams.MIN_NET_DEBT(ZERO_ADDRESS)
      BORROWING_FEE_FLOOR = await psyParams.BORROWING_FEE_FLOOR(ZERO_ADDRESS)

      SLSD_GAS_COMPENSATION_ERC20 = await psyParams.SLSD_GAS_COMPENSATION(erc20.address)
      MIN_NET_DEBT_ERC20 = await psyParams.MIN_NET_DEBT(erc20.address)
      BORROWING_FEE_FLOOR_ERC20 = await psyParams.BORROWING_FEE_FLOOR(erc20.address)
      
      
      console.log(await psyParams.DEBT_CEILINGS(erc20.address))
      console.log(await psyParams.MIN_NET_DEBT(erc20.address))

      let index = 0
      for (const acc of accounts) {
        await psyToken.approve(psyStaking.address, await web3.eth.getBalance(acc), { from: acc })
        await erc20.mint(acc, await web3.eth.getBalance(acc))
        index++

        if (index >= 20) break
      }

      stabilityPoolV3 = await StabilityPool.new()
      await stabilityPoolV3.setAddresses(
        slsdToken.address,
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.troveManagerHelpers.address,
        contracts.slsdToken.address,
        contracts.sortedTroves.address,
        PSYContracts.communityIssuance.address,
        contracts.psyParameters.address
      )

    })
    
    it('BorrowerOperations.openTrove(): it will trnasfer borrowing fee to treasury when PSY not deployed yet', async () => {
        
        
        const treasuryBalanceBefore = await slsdToken.balanceOf(treasury)
        assert.isTrue(treasuryBalanceBefore.eq(toBN('0')))
        
        const tx1 = await borrowerOperations.openTrove(
            erc20.address,
            dec(100, 30),
            th._100pct,
            MIN_NET_DEBT_ERC20,
            A,
            A,
            { from: A }
        )
        const tx2 = await borrowerOperations.openTrove(
            ZERO_ADDRESS,
            0,
            th._100pct,
            MIN_NET_DEBT,
            A,
            A,
            { from: A, value: dec(100, 30) }
        )
         
        const ADebtAfter = await getTroveEntireDebt(A)
        const ADebtAfter_Asset = await getTroveEntireDebt(A, erc20.address)
        const A_SLSDTokenBalance = await slsdToken.balanceOf(A)
        assert.isTrue(ADebtAfter.gt(MIN_NET_DEBT.add(SLSD_GAS_COMPENSATION)))
        assert.isTrue(ADebtAfter_Asset.gt(MIN_NET_DEBT_ERC20.add(SLSD_GAS_COMPENSATION_ERC20)))
        
        th.assertIsApproximatelyEqual(A_SLSDTokenBalance, MIN_NET_DEBT_ERC20.add(MIN_NET_DEBT_ERC20))

        const emittedFee1 = toBN(await th.getEventArgByName(tx1, 'SLSDBorrowingFeePaid', '_SLSDFee'))
        const emittedFee2 = toBN(await th.getEventArgByName(tx2, 'SLSDBorrowingFeePaid', '_SLSDFee'))
        assert.isTrue(emittedFee1.gt(toBN('0')))
        assert.isTrue(emittedFee2.gt(toBN('0')))

        const treasuryBalanceAfter = await slsdToken.balanceOf(treasury)
        assert.isTrue(treasuryBalanceAfter.gt(toBN('0')))
        
    })

    it('BorrowerOperations.adjustTrove(): it will trnasfer borrowing fee to treasury when PSY not deployed yet', async () => {
        await openTrove({
            extraSLSDAmount: toBN(dec(10000, 18)),
            ICR: toBN(dec(2, 18)),
            extraParams: { from: alice },
          })

          await openTrove({
            asset: erc20.address,
            extraSLSDAmount: toBN(dec(10000, 18)),
            ICR: toBN(dec(2, 18)),
            extraParams: { from: alice },
          })

    
          const txAlice = await borrowerOperations.adjustTrove(
            ZERO_ADDRESS,
            0,
            th._100pct,
            0,
            dec(50, 18),
            true,
            alice,
            alice,
            { from: alice, value: dec(100, 'ether') }
          )
          assert.isTrue(txAlice.receipt.status)
    
          const txAlice_Asset = await borrowerOperations.adjustTrove(
            erc20.address,
            dec(100, 'ether'),
            th._100pct,
            0,
            dec(50, 18),
            true,
            alice,
            alice,
            { from: alice }
          )
          assert.isTrue(txAlice_Asset.receipt.status)
    
          // Check emitted fee > 0
          const emittedFee = toBN(await th.getEventArgByName(txAlice, 'SLSDBorrowingFeePaid', '_SLSDFee'))
          assert.isTrue(emittedFee.gt(toBN('0')))
    
          const emittedFee_Asset = toBN(
            await th.getEventArgByName(txAlice_Asset, 'SLSDBorrowingFeePaid', '_SLSDFee')
          )
          assert.isTrue(emittedFee_Asset.gt(toBN('0')))
    
    })

    it('TroveManger.redeemCollateral(): it will transfer redemption fee to treasury when PSY not deployed yet', async () => {
        
        const treasuryBalanceInitial = toBN(await web3.eth.getBalance(treasury))
        const treasuryBalanceInitial_Asset = toBN(await erc20.balanceOf(treasury))
        
        await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: whale } })
        await openTrove({ ICR: toBN(dec(200, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: A } })
        await openTrove({ ICR: toBN(dec(190, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: B } })
        await openTrove({ ICR: toBN(dec(180, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: C } })

        await openTrove({ asset: erc20.address, ICR: toBN(dec(20, 18)), extraParams: { from: whale } })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(200, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: A },
        })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(190, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: B },
        })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(180, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: C },
        })

        // Check baseRate == 0
        assert.equal(await troveManagerHelpers.baseRate(ZERO_ADDRESS), '0')
        assert.equal(await troveManagerHelpers.baseRate(erc20.address), '0')

        // Check treasury balance before is zero
        const treasuryBalanceBefore = toBN(await web3.eth.getBalance(treasury))
        assert.isTrue(treasuryBalanceBefore.eq(treasuryBalanceInitial))
        const treasuryBalanceBefore_Asset = toBN(await erc20.balanceOf(treasury))
        assert.isTrue(treasuryBalanceBefore_Asset.eq(treasuryBalanceInitial_Asset))
        
        const A_balanceBefore = await slsdToken.balanceOf(A)

        // A redeems 10 SLSD
        await th.redeemCollateral(A, contracts, dec(10, 18), ZERO_ADDRESS)
        await th.redeemCollateral(A, contracts, dec(10, 18), erc20.address)

        // Check A's balance has decreased by 10 SLSD
        assert.equal(await slsdToken.balanceOf(A), A_balanceBefore.sub(toBN(dec(10, 18)).mul(toBN(2))).toString())

        // Check baseRate is now non-zero
        const baseRate_1 = await troveManagerHelpers.baseRate(ZERO_ADDRESS)
        assert.isTrue(baseRate_1.gt(toBN('0')))

        const baseRate_1_Asset = await troveManagerHelpers.baseRate(erc20.address)
        assert.isTrue(baseRate_1_Asset.gt(toBN('0')))

        // Check Treasury address balance after is greater than before
        const treasuryBalanceAfter = toBN(await web3.eth.getBalance(treasury))
        assert.isTrue(treasuryBalanceAfter.gt(treasuryBalanceBefore))

        const treasuryBalanceAfter_Asset = toBN(await erc20.balanceOf(treasury))
        assert.isTrue(treasuryBalanceAfter_Asset.gt(treasuryBalanceBefore_Asset))

    })    

    it('StabilityPool: it works without PSY', async () => {
        //setting up stability pools
        await contracts.stabilityPoolTemplate.setAddresses(
            ZERO_ADDRESS,
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.troveManagerHelpers.address,
            contracts.slsdToken.address,
            contracts.sortedTroves.address,
            ZERO_ADDRESS,
            contracts.psyParameters.address
        )
    
        await contracts.stabilityPoolTemplateV2.setAddresses(
            contracts.erc20.address,
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.troveManagerHelpers.address,
            contracts.slsdToken.address,
            contracts.sortedTroves.address,
            ZERO_ADDRESS,
            contracts.psyParameters.address
        )
    
        await contracts.adminContract.addNewCollateral(
            contracts.stabilityPoolTemplate.address,
            ZERO_ADDRESS,
            0,
            0,
            0
        )
        
        await contracts.adminContract.addNewCollateral(
            contracts.stabilityPoolTemplateV2.address,
            ZERO_ADDRESS,
            0,
            0,
            0
        )


        stabilityPool = await StabilityPool.at(
            await contracts.stabilityPoolManager.getAssetStabilityPool(ZERO_ADDRESS)
        )
        stabilityPoolERC20 = await StabilityPool.at(
            await contracts.stabilityPoolManager.getAssetStabilityPool(erc20.address)
        )

        //setting open troves for liquidations test
        await borrowerOperations.openTrove(
            ZERO_ADDRESS, 
            0, 
            th._100pct, 
            dec(10000, 18), 
            A,
            A, 
            {
                from: A,
                value: dec(1000, 'ether'),
            }
        )
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
        const PSYIssuedBefore = await communityIssuance.totalPSYIssued(stabilityPool.address)

        const G_BeforeERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
        const PSYIssuedBeforeERC20 = await communityIssuance.totalPSYIssued(stabilityPoolERC20.address)

        // 1 month passes
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

        //  A withdraws some deposit. Triggers issuance.
        const tx = await stabilityPool.withdrawFromSP(1000, { from: A, gasPrice: 0 })
        assert.isTrue(tx.receipt.status)

        const txERC20 = await stabilityPoolERC20.withdrawFromSP(1000, { from: A, gasPrice: 0 })
        assert.isTrue(txERC20.receipt.status)

        // Check G and PSYIssued do not increase, since PSY module not delpoyed
        const G_After = await stabilityPool.epochToScaleToG(0, 0)
        const PSYIssuedAfter = await communityIssuance.totalPSYIssued(stabilityPool.address)

        const G_AfterERC20 = await stabilityPoolERC20.epochToScaleToG(0, 0)
        const PSYIssuedAfterERC20 = await communityIssuance.totalPSYIssued(stabilityPoolERC20.address)

        assert.isTrue(G_After.eq(G_Before))
        assert.isTrue(PSYIssuedAfter.eq(PSYIssuedBefore))

        assert.isTrue(G_AfterERC20.eq(G_BeforeERC20))
        assert.isTrue(PSYIssuedAfterERC20.eq(PSYIssuedBeforeERC20))

         // Check that depositor B has no PSY gain
        assert.equal(await stabilityPool.getDepositorPSYGain(A), '0')
        assert.equal(await stabilityPoolERC20.getDepositorPSYGain(A), '0')
    })

    
    it('BorrowerOperations.adjustTrove(): it can trnasfer borrowing fee to Staking pool when PSY is deployed', async () => {
          
        await borrowerOperations.addPSYModules(
            psyStaking.address
        )
        await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts)

        // Check PSY SLSD balance before == 0
        const PSYStaking_SLSDBalance_Before = await slsdToken.balanceOf(psyStaking.address)
        assert.equal(PSYStaking_SLSDBalance_Before, '0')
         
        await openTrove({
            extraSLSDAmount: toBN(dec(10000, 18)),
            ICR: toBN(dec(2, 18)),
            extraParams: { from: alice },
        })

        await openTrove({
            asset: erc20.address,
            extraSLSDAmount: toBN(dec(10000, 18)),
            ICR: toBN(dec(2, 18)),
            extraParams: { from: alice },
        })


        const txAlice = await borrowerOperations.adjustTrove(
        ZERO_ADDRESS,
        0,
        th._100pct,
        0,
        dec(50, 18),
        true,
        alice,
        alice,
        { from: alice, value: dec(100, 'ether') }
        )
        assert.isTrue(txAlice.receipt.status)

        const txAlice_Asset = await borrowerOperations.adjustTrove(
        erc20.address,
        dec(100, 'ether'),
        th._100pct,
        0,
        dec(50, 18),
        true,
        alice,
        alice,
        { from: alice }
        )
        assert.isTrue(txAlice_Asset.receipt.status)

        // Check emitted fee > 0
        const emittedFee = toBN(await th.getEventArgByName(txAlice, 'SLSDBorrowingFeePaid', '_SLSDFee'))
        assert.isTrue(emittedFee.gt(toBN('0')))

        const emittedFee_Asset = toBN(
            await th.getEventArgByName(txAlice_Asset, 'SLSDBorrowingFeePaid', '_SLSDFee')
        )
        assert.isTrue(emittedFee_Asset.gt(toBN('0')))

        // Check PSY SLSD balance after has increased
        const PSYStaking_SLSDBalance_After = await slsdToken.balanceOf(psyStaking.address)
        assert.isTrue(PSYStaking_SLSDBalance_After.gt(PSYStaking_SLSDBalance_Before))
    
    })
    
    it('TroveManger.redeemCollateral(): it will transfer redemption fee to treasury when PSY not deployed yet', async () => {
        
        await troveManager.addPSYModules(
            psyStaking.address
        )
        await deploymentHelper.connectPSYContractsToCore(PSYContracts, contracts)
        
        const treasuryBalanceInitial = toBN(await web3.eth.getBalance(treasury))
        const treasuryBalanceInitial_Asset = toBN(await erc20.balanceOf(treasury))
        
        await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: whale } })
        await openTrove({ ICR: toBN(dec(200, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: A } })
        await openTrove({ ICR: toBN(dec(190, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: B } })
        await openTrove({ ICR: toBN(dec(180, 16)), extraSLSDAmount: dec(100, 18), extraParams: { from: C } })

        await openTrove({ asset: erc20.address, ICR: toBN(dec(20, 18)), extraParams: { from: whale } })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(200, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: A },
        })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(190, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: B },
        })
        await openTrove({
        asset: erc20.address,
        ICR: toBN(dec(180, 16)),
        extraSLSDAmount: dec(100, 18),
        extraParams: { from: C },
        })

        // Check baseRate == 0
        assert.equal(await troveManagerHelpers.baseRate(ZERO_ADDRESS), '0')
        assert.equal(await troveManagerHelpers.baseRate(erc20.address), '0')

        // Check PSY Staking ETH-fees-per-PSY-staked before is zero
        assert.equal(await psyStaking.F_ASSETS(ZERO_ADDRESS), '0')
        assert.equal(await psyStaking.F_ASSETS(erc20.address), '0')
        
        const A_balanceBefore = await slsdToken.balanceOf(A)

        // A redeems 10 SLSD
        await th.redeemCollateral(A, contracts, dec(10, 18), ZERO_ADDRESS)
        await th.redeemCollateral(A, contracts, dec(10, 18), erc20.address)

        // Check A's balance has decreased by 10 SLSD
        assert.equal(await slsdToken.balanceOf(A), A_balanceBefore.sub(toBN(dec(10, 18)).mul(toBN(2))).toString())

        // Check baseRate is now non-zero
        const baseRate_1 = await troveManagerHelpers.baseRate(ZERO_ADDRESS)
        assert.isTrue(baseRate_1.gt(toBN('0')))

        const baseRate_1_Asset = await troveManagerHelpers.baseRate(erc20.address)
        assert.isTrue(baseRate_1_Asset.gt(toBN('0')))

        // Check PSY Staking ETH-fees-per-PSY-staked after is non-zero
        assert.isTrue((await psyStaking.F_ASSETS(ZERO_ADDRESS)).gt('0'))
        assert.isTrue((await psyStaking.F_ASSETS(erc20.address)).gt('0'))

    })    
    
    it('StabilityPool: it starts distributing rewards when PSY is deployed', async () => {
        
        //setting up stability pools
        await contracts.stabilityPoolTemplate.setAddresses(
            ZERO_ADDRESS,
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.troveManagerHelpers.address,
            contracts.slsdToken.address,
            contracts.sortedTroves.address,
            ZERO_ADDRESS,
            contracts.psyParameters.address
        )

        await contracts.stabilityPoolTemplateV2.setAddresses(
            contracts.erc20.address,
            contracts.borrowerOperations.address,
            contracts.troveManager.address,
            contracts.troveManagerHelpers.address,
            contracts.slsdToken.address,
            contracts.sortedTroves.address,
            ZERO_ADDRESS,
            contracts.psyParameters.address
        )

        await contracts.adminContract.addNewCollateral(
            contracts.stabilityPoolTemplate.address,
            ZERO_ADDRESS,
            0,
            0,
            0
        )

        await contracts.adminContract.addNewCollateral(
            contracts.stabilityPoolTemplateV2.address,
            ZERO_ADDRESS,
            0,
            0,
            0
        )


        stabilityPool = await StabilityPool.at(
            await contracts.stabilityPoolManager.getAssetStabilityPool(ZERO_ADDRESS)
        )
        stabilityPoolERC20 = await StabilityPool.at(
            await contracts.stabilityPoolManager.getAssetStabilityPool(erc20.address)
        )

        //setting open troves for liquidations test
        await borrowerOperations.openTrove(
            ZERO_ADDRESS, 
            0, 
            th._100pct, 
            dec(10000, 18), 
            A,
            A, 
            {
                from: A,
                value: dec(1000, 'ether'),
            }
        )
        await borrowerOperations.openTrove(
            erc20.address,
            dec(1000, 'ether'),
            th._100pct,
            dec(10000, 18),
            A,
            A,
            { from: A }
        )
        await borrowerOperations.openTrove(
            ZERO_ADDRESS, 
            0, 
            th._100pct, 
            dec(10000, 18), 
            B,
            B, 
            {
                from: B,
                value: dec(1000, 'ether'),
            }
        )
        await borrowerOperations.openTrove(
            erc20.address,
            dec(1000, 'ether'),
            th._100pct,
            dec(10000, 18),
            B,
            B,
            { from: B }
        )
        await stabilityPool.provideToSP(dec(1000, 18), { from: A })
        await stabilityPoolERC20.provideToSP(dec(1000, 18), { from: A })

        assert.equal((await stabilityPool.deposits(A)).toString(), dec(1000, 18))
        assert.equal((await stabilityPoolERC20.deposits(A)).toString(), dec(1000, 18))

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

        // Get communityIssuance before
        const PSYIssuedBefore = await communityIssuance.totalPSYIssued(stabilityPool.address)
        const PSYIssuedBeforeERC20 = await communityIssuance.totalPSYIssued(stabilityPoolERC20.address)
        const PSYBalanceBefore = await psyToken.balanceOf(A)

        assert.isTrue(PSYIssuedBefore.eq(toBN('0')))
        assert.isTrue(PSYIssuedBeforeERC20.eq(toBN('0')))
        assert.isTrue(PSYBalanceBefore.eq(toBN('0')))

        //PSY module registerred
        const treasurySig = await psyToken.treasury()
        await PSYContracts.psyStaking.setAddresses(
            PSYContracts.psyToken.address,
            contracts.slsdToken.address,
            contracts.troveManager.address,
            contracts.troveManagerHelpers.address,
            contracts.borrowerOperations.address,
            contracts.activePool.address,
            treasurySig
        )
      
        await PSYContracts.psyStaking.unpause()
    
        await PSYContracts.communityIssuance.setAddresses(
        PSYContracts.psyToken.address,
        contracts.stabilityPoolManager.address,
        contracts.adminContract.address
        )
    
        await PSYContracts.lockedPSY.setAddresses(PSYContracts.psyToken.address)
        
        const supply = dec(32000000, 18)
        const weeklyReward = dec(32000000 / 4, 18) // 8M
        await psyToken.approve(communityIssuance.address, ethers.constants.MaxUint256, {
            from: treasurySig,
        })
        await psyToken.unprotectedMint(treasurySig, supply)
      
        await stabilityPool.addPSYModules(communityIssuance.address)
        await stabilityPoolERC20.addPSYModules(communityIssuance.address)
        
        await communityIssuance.addFundToStabilityPoolFrom(
            stabilityPool.address,
            supply,
            treasurySig
        );
        await communityIssuance.setWeeklyPSYDistribution(
            stabilityPool.address,
            weeklyReward
        );
        await communityIssuance.addFundToStabilityPoolFrom(
            stabilityPoolERC20.address,
            supply,
            treasurySig
        );
        await communityIssuance.setWeeklyPSYDistribution(
            stabilityPoolERC20.address,
            weeklyReward
        );

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
            50,
            dec(100000, 18)
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
            50,
            dec(100000, 18)
        ) 

        // reflect PSY configuration to pool
        await stabilityPool.provideToSP(dec(1, 1), { from: A })
        await stabilityPoolERC20.provideToSP(dec(1, 1), { from: A })
        
        // 1 month passes
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_PSYTH, web3.currentProvider)

        
        //  A withdraws some deposit. Triggers issuance.
        const tx = await stabilityPool.withdrawFromSP(1000, { from: A, gasPrice: 0 })
        assert.isTrue(tx.receipt.status)

        const txERC20 = await stabilityPoolERC20.withdrawFromSP(1000, { from: A, gasPrice: 0 })
        assert.isTrue(txERC20.receipt.status)
        //PSYIssued increased, since PSY module is already delpoyed
        
        const PSYIssuedAfter = await communityIssuance.totalPSYIssued(stabilityPool.address)
        const PSYIssuedAfterERC20 = await communityIssuance.totalPSYIssued(stabilityPoolERC20.address)

        assert.isTrue(PSYIssuedAfter.gt(PSYIssuedBefore))

        assert.isTrue(PSYIssuedAfterERC20.gt(PSYIssuedBeforeERC20))

        // Check that depositor A has no PSY gain
        const PSYBalanceAfter = await psyToken.balanceOf(A)
        assert.isTrue(PSYBalanceAfter.gt(PSYBalanceBefore))

    })
  }
  describe('Without proxy', async () => {
    testCorpus({ withProxy: false })
  })
})