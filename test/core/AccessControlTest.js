const deploymentHelper = require('../utils/deploymentHelpers.js')
const testHelpers = require('../utils/testHelpers.js')
const TroveManagerTester = artifacts.require('TroveManagerTester')
const StabilityPool = artifacts.require('StabilityPool.sol')

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const EMPTY_ADDRESS = '0x' + '0'.repeat(40)
const dec = th.dec
const toBN = th.toBN
const assertRevert = th.assertRevert

/* The majority of access control tests are contained in this file. 
However, tests for restrictions on the Liquity admin address's capabilities during the first year are found in:

test/launchSequenceTest/DuringLockupPeriodTest.js */

contract(
  'Access Control: Liquity functions with the caller restricted to Liquity contract(s)',
  async (accounts) => {
    const [owner, alice, bob, carol] = accounts
    const [treasury, multisig] = accounts.slice(997, 1000)

    let coreContracts

    let priceFeed
    let slsdToken
    let sortedTroves
    let troveManager
    let troveManagerHelpers
    let nameRegistry
    let activePool
    let stabilityPool
    let defaultPool
    let functionCaller
    let borrowerOperations

    let psyStaking
    let psyToken
    let communityIssuance

    before(async () => {
      coreContracts = await deploymentHelper.deployLiquityCore()
      coreContracts.troveManager = await TroveManagerTester.new()
      coreContracts = await deploymentHelper.deploySLSDToken(coreContracts)

      const PSYContracts = await deploymentHelper.deployPSYContractsHardhat(treasury)

      priceFeed = coreContracts.priceFeed
      slsdToken = coreContracts.slsdToken
      sortedTroves = coreContracts.sortedTroves
      troveManager = coreContracts.troveManager
      troveManagerHelpers = coreContracts.troveManagerHelpers
      nameRegistry = coreContracts.nameRegistry
      activePool = coreContracts.activePool
      stabilityPool = coreContracts.stabilityPool
      defaultPool = coreContracts.defaultPool
      functionCaller = coreContracts.functionCaller
      borrowerOperations = coreContracts.borrowerOperations

      psyStaking = PSYContracts.psyStaking
      psyToken = PSYContracts.psyToken
      communityIssuance = PSYContracts.communityIssuance

      await deploymentHelper.connectCoreContracts(coreContracts, PSYContracts)
      await deploymentHelper.connectPSYContractsToCore(PSYContracts, coreContracts)
      stabilityPool = await StabilityPool.at(
        await coreContracts.stabilityPoolManager.getAssetStabilityPool(EMPTY_ADDRESS)
      )

      for (account of accounts.slice(0, 10)) {
        await th.openTrove(coreContracts, {
          extraSLSDAmount: toBN(dec(20000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: account },
        })
      }

      const expectedCISupplyCap = '64000000000000000000000000' // 32mil

      // Check CI has been properly funded
      const bal = await psyToken.balanceOf(communityIssuance.address)
      assert.equal(bal.toString(), expectedCISupplyCap)
    })

    describe('BorrowerOperations', async (accounts) => {
      it('moveETHGainToTrove(): reverts when called by an account that is not StabilityPool', async () => {
        // Attempt call from alice
        try {
          const tx1 = await borrowerOperations.moveETHGainToTrove(EMPTY_ADDRESS, 0, bob, bob, bob, {
            from: bob,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "BorrowerOps: Caller is not Stability Pool")
        }
      })
    })

    describe('TroveManager', async (accounts) => {
      // applyPendingRewards
      it('applyPendingRewards(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.applyPendingRewards(
            EMPTY_ADDRESS,
            activePool.address,
            defaultPool.address,
            bob,
            { from: alice }
          )
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // updateRewardSnapshots
      it('updateRewardSnapshots(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.updateTroveRewardSnapshots(EMPTY_ADDRESS, bob, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // removeStake
      it('removeStake(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.removeStake(EMPTY_ADDRESS, bob, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // updateStakeAndTotalStakes
      it('updateStakeAndTotalStakes(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.updateStakeAndTotalStakes(EMPTY_ADDRESS, bob, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // closeTrove
      it('closeTrove(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.closeTrove(EMPTY_ADDRESS, bob, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // addTroveOwnerToArray
      it('addTroveOwnerToArray(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.addTroveOwnerToArray(EMPTY_ADDRESS, bob, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // setTroveStatus
      it('setTroveStatus(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.setTroveStatus(EMPTY_ADDRESS, bob, 1, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // increaseTroveColl
      it('increaseTroveColl(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.increaseTroveColl(EMPTY_ADDRESS, bob, 100, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // decreaseTroveColl
      it('decreaseTroveColl(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.decreaseTroveColl(EMPTY_ADDRESS, bob, 100, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // increaseTroveDebt
      it('increaseTroveDebt(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.increaseTroveDebt(EMPTY_ADDRESS, bob, 100, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })

      // decreaseTroveDebt
      it('decreaseTroveDebt(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        try {
          const txAlice = await troveManagerHelpers.decreaseTroveDebt(EMPTY_ADDRESS, bob, 100, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      })
    })

    describe('ActivePool', async (accounts) => {
      // sendETH
      it('sendETH(): reverts when called by an account that is not BO nor TroveM nor SP', async () => {
        // Attempt call from alice
        try {
          const txAlice = await activePool.sendAsset(EMPTY_ADDRESS, alice, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
        }
      })

      // increaseSLSD
      it('increaseSLSDDebt(): reverts when called by an account that is not BO nor TroveM', async () => {
        // Attempt call from alice
        try {
          const txAlice = await activePool.increaseSLSDDebt(EMPTY_ADDRESS, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'Caller is neither BorrowerOperations nor TroveManager')
        }
      })

      // decreaseSLSD
      it('decreaseSLSDDebt(): reverts when called by an account that is not BO nor TroveM nor SP', async () => {
        // Attempt call from alice
        try {
          const txAlice = await activePool.decreaseSLSDDebt(EMPTY_ADDRESS, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
        }
      })

      // fallback (payment)
      it('fallback(): reverts when called by an account that is not Borrower Operations nor Default Pool', async () => {
        // Attempt call from alice
        try {
          const txAlice = await web3.eth.sendTransaction({ from: alice, to: activePool.address, value: 100 })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'ActivePool: Caller is neither BO nor Default Pool')
        }
      })
    })

    describe('DefaultPool', async (accounts) => {
      // sendETHToActivePool
      it('sendETHToActivePool(): reverts when called by an account that is not TroveManager', async () => {
        // Attempt call from alice
        try {
          const txAlice = await defaultPool.sendAssetToActivePool(EMPTY_ADDRESS, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'Caller is not the TroveManager')
        }
      })

      // increaseSLSD
      it('increaseSLSDDebt(): reverts when called by an account that is not TroveManager', async () => {
        // Attempt call from alice
        try {
          const txAlice = await defaultPool.increaseSLSDDebt(EMPTY_ADDRESS, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'Caller is not the TroveManager')
        }
      })

      // decreaseSLSD
      it('decreaseSLSD(): reverts when called by an account that is not TroveManager', async () => {
        // Attempt call from alice
        try {
          const txAlice = await defaultPool.decreaseSLSDDebt(EMPTY_ADDRESS, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'Caller is not the TroveManager')
        }
      })

      // fallback (payment)
      it('fallback(): reverts when called by an account that is not the Active Pool', async () => {
        // Attempt call from alice
        try {
          const txAlice = await web3.eth.sendTransaction({ from: alice, to: defaultPool.address, value: 100 })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'DefaultPool: Caller is not the ActivePool')
        }
      })
    })

    describe('StabilityPool', async (accounts) => {
      // --- onlyTroveManager ---

      // offset
      it('offset(): reverts when called by an account that is not TroveManager', async () => {
        // Attempt call from alice
        try {
          txAlice = await stabilityPool.offset(100, 10, { from: alice })
          assert.fail(txAlice)
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'SortedTroves: Caller is not the TroveManager')
        }
      })

      // --- onlyActivePool ---

      // fallback (payment)
      it('fallback(): reverts when called by an account that is not the Active Pool', async () => {
        // Attempt call from alice
        try {
          const txAlice = await web3.eth.sendTransaction({
            from: alice,
            to: stabilityPool.address,
            value: 100,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'StabilityPool: Caller is not ActivePool')
        }
      })
    })

    describe('SLSDToken', async (accounts) => {
      //    mint
      it('mint(): reverts when called by an account that is not BorrowerOperations', async () => {
        // Attempt call from alice
        const txAlice = slsdToken.mint(th.ZERO_ADDRESS, bob, 100, { from: alice })
        await th.assertRevert(txAlice, 'Caller is not BorrowerOperations')
      })

      // burn
      it('burn(): reverts when called by an account that is not BO nor TroveM nor SP', async () => {
        // Attempt call from alice
        try {
          const txAlice = await slsdToken.burn(bob, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
        }
      })

      // sendToPool
      it('sendToPool(): reverts when called by an account that is not StabilityPool', async () => {
        // Attempt call from alice
        try {
          const txAlice = await slsdToken.sendToPool(bob, activePool.address, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          //assert.include(err.message, "Caller is not the StabilityPool")
        }
      })

      // returnFromPool
      it('returnFromPool(): reverts when called by an account that is not TroveManager nor StabilityPool', async () => {
        // Attempt call from alice
        try {
          const txAlice = await slsdToken.returnFromPool(activePool.address, bob, 100, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          // assert.include(err.message, "Caller is neither TroveManager nor StabilityPool")
        }
      })
    })

    describe('SortedTroves', async (accounts) => {
      // --- onlyBorrowerOperations ---
      //     insert
      it('insert(): reverts when called by an account that is not BorrowerOps or TroveM', async () => {
        // Attempt call from alice
        try {
          const txAlice = await sortedTroves.insert(EMPTY_ADDRESS, bob, '150000000000000000000', bob, bob, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, ' Caller is neither BO nor TroveM')
        }
      })

      // --- onlyTroveManager ---
      // remove
      it('remove(): reverts when called by an account that is not TroveManager', async () => {
        // Attempt call from alice
        try {
          const txAlice = await sortedTroves.remove(EMPTY_ADDRESS, bob, { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, ' Caller is not the TroveManager')
        }
      })

      // --- onlyTroveMorBM ---
      // reinsert
      it('reinsert(): reverts when called by an account that is neither BorrowerOps nor TroveManager', async () => {
        // Attempt call from alice
        try {
          const txAlice = await sortedTroves.reInsert(EMPTY_ADDRESS, bob, '150000000000000000000', bob, bob, {
            from: alice,
          })
        } catch (err) {
          assert.include(err.message, 'revert')
          assert.include(err.message, 'Caller is neither BO nor TroveM')
        }
      })
    })

    describe('PSYStaking', async (accounts) => {
      it('increaseF_SLSD(): reverts when caller is not TroveManager', async () => {
        try {
          const txAlice = await psyStaking.increaseF_SLSD(dec(1, 18), { from: alice })
        } catch (err) {
          assert.include(err.message, 'revert')
        }
      })
    })

    describe('CommunityIssuance', async (accounts) => {
      it('sendPSY(): reverts when caller is not the StabilityPool', async () => {
        const tx1 = communityIssuance.sendPSY(alice, dec(100, 18), { from: alice })
        const tx2 = communityIssuance.sendPSY(bob, dec(100, 18), { from: alice })
        const tx3 = communityIssuance.sendPSY(stabilityPool.address, dec(100, 18), { from: alice })

        assertRevert(tx1)
        assertRevert(tx2)
        assertRevert(tx3)
      })

      it('issuePSY(): reverts when caller is not the StabilityPool', async () => {
        const tx1 = communityIssuance.issuePSY({ from: alice })

        assertRevert(tx1)
      })
    })
  }
)
