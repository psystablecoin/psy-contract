const StabilityPool = artifacts.require('./StabilityPool.sol')
const ActivePool = artifacts.require('./ActivePool.sol')
const CollSurplusPool = artifacts.require('./CollSurplusPool.sol')
const StabilityPoolManager = artifacts.require('./StabilityPoolManager.sol')
const DefaultPool = artifacts.require('./DefaultPool.sol')
const NonPayable = artifacts.require('./NonPayable.sol')
const PSYParameters = artifacts.require('./PSYParameters.sol')
const CommunityIssuance = artifacts.require('./CommunityIssuance.sol')

const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants')
const testHelpers = require('../utils/testHelpers.js')

const th = testHelpers.TestHelper
const dec = th.dec

const _minus_1_Ether = web3.utils.toWei('-1', 'ether')

contract('StabilityPool', async (accounts) => {
  /* mock* are EOA’s, temporarily used to call protected functions.
  TODO: Replace with mock contracts, and later complete transactions from EOA
  */
  let stabilityPool

  const [owner, alice] = accounts

  beforeEach(async () => {
    stabilityPool = await StabilityPool.new()
    const mockCommunityIssuance = (await CommunityIssuance.new()).address
    const dumbContractAddress = (await NonPayable.new()).address
    const dfrancParameters = await PSYParameters.new()
    await dfrancParameters.sanitizeParameters(ZERO_ADDRESS)
    await stabilityPool.setAddresses(
      ZERO_ADDRESS,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress,
      dumbContractAddress,
      mockCommunityIssuance,
      dfrancParameters.address
    )
  })

  it('getAssetBalance(): gets the recorded ETH balance', async () => {
    const recordedETHBalance = await stabilityPool.getAssetBalance()
    assert.equal(recordedETHBalance, 0)
  })

  it('getTotalSLSDDeposits(): gets the recorded SLSD balance', async () => {
    const recordedETHBalance = await stabilityPool.getTotalSLSDDeposits()
    assert.equal(recordedETHBalance, 0)
  })
})

contract('ActivePool', async (accounts) => {
  let activePool, mockBorrowerOperations

  const [owner, alice] = accounts
  beforeEach(async () => {
    activePool = await ActivePool.new()
    mockBorrowerOperations = await NonPayable.new()
    let collSurplusPool = await CollSurplusPool.new()
    let stabilityPoolManager = await StabilityPoolManager.new()
    const dumbContractAddress = (await NonPayable.new()).address
    await activePool.setAddresses(
      mockBorrowerOperations.address,
      dumbContractAddress,
      dumbContractAddress,
      stabilityPoolManager.address,
      dumbContractAddress,
      collSurplusPool.address
    )
  })

  it('getAssetBalance(): gets the recorded ETH balance', async () => {
    const recordedETHBalance = await activePool.getAssetBalance(ZERO_ADDRESS)
    assert.equal(recordedETHBalance, 0)
  })

  it('getSLSDDebt(): gets the recorded SLSD balance', async () => {
    const recordedETHBalance = await activePool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedETHBalance, 0)
  })

  it('increaseSLSD(): increases the recorded SLSD balance by the correct amount', async () => {
    const recordedSLSD_balanceBefore = await activePool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceBefore, 0)

    // await activePool.increaseSLSDDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseSLSDDebtData = th.getTransactionData('increaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx = await mockBorrowerOperations.forward(activePool.address, increaseSLSDDebtData)
    assert.isTrue(tx.receipt.status)
    const recordedSLSD_balanceAfter = await activePool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceAfter, 100)
  })
  // Decrease
  it('decreaseSLSD(): decreases the recorded SLSD balance by the correct amount', async () => {
    // start the pool on 100 wei
    //await activePool.increaseSLSDDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseSLSDDebtData = th.getTransactionData('increaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx1 = await mockBorrowerOperations.forward(activePool.address, increaseSLSDDebtData)
    assert.isTrue(tx1.receipt.status)

    const recordedSLSD_balanceBefore = await activePool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceBefore, 100)

    //await activePool.decreaseSLSDDebt(100, { from: mockBorrowerOperationsAddress })
    const decreaseSLSDDebtData = th.getTransactionData('decreaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx2 = await mockBorrowerOperations.forward(activePool.address, decreaseSLSDDebtData)
    assert.isTrue(tx2.receipt.status)
    const recordedSLSD_balanceAfter = await activePool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceAfter, 0)
  })

  // send raw ether
  it('sendETH(): decreases the recorded ETH balance by the correct amount', async () => {
    // setup: give pool 2 ether
    const activePool_initialBalance = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    assert.equal(activePool_initialBalance, 0)
    // start pool with 2 ether
    //await web3.eth.sendTransaction({ from: mockBorrowerOperationsAddress, to: activePool.address, value: dec(2, 'ether') })
    const tx1 = await mockBorrowerOperations.forward(activePool.address, '0x', {
      from: owner,
      value: dec(2, 'ether'),
    })
    assert.isTrue(tx1.receipt.status)

    const activePool_BalanceBeforeTx = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    const alice_Balance_BeforeTx = web3.utils.toBN(await web3.eth.getBalance(alice))

    assert.equal(activePool_BalanceBeforeTx, dec(2, 'ether'))

    // send ether from pool to alice
    //await activePool.sendETH(alice, dec(1, 'ether'), { from: mockBorrowerOperationsAddress })
    const sendETHData = th.getTransactionData('sendAsset(address,address,uint256)', [
      ZERO_ADDRESS,
      alice,
      web3.utils.toHex(dec(1, 'ether')),
    ])
    const tx2 = await mockBorrowerOperations.forward(activePool.address, sendETHData, { from: owner })
    assert.isTrue(tx2.receipt.status)

    const activePool_BalanceAfterTx = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    const alice_Balance_AfterTx = web3.utils.toBN(await web3.eth.getBalance(alice))

    const alice_BalanceChange = alice_Balance_AfterTx.sub(alice_Balance_BeforeTx)
    const pool_BalanceChange = activePool_BalanceAfterTx.sub(activePool_BalanceBeforeTx)
    assert.equal(alice_BalanceChange, dec(1, 'ether'))
    assert.equal(pool_BalanceChange, _minus_1_Ether)
  })
})

contract('DefaultPool', async (accounts) => {
  let defaultPool, mockTroveManager, mockActivePool

  const [owner, alice] = accounts
  beforeEach(async () => {
    defaultPool = await DefaultPool.new()
    mockTroveManager = await NonPayable.new()
    mockTroveManagerHelpers = await NonPayable.new()
    mockActivePool = await NonPayable.new()
    await defaultPool.setAddresses(
      mockTroveManager.address,
      mockTroveManagerHelpers.address,
      mockActivePool.address
    )
  })

  it('getAssetBalance(): gets the recorded SLSD balance', async () => {
    const recordedETHBalance = await defaultPool.getAssetBalance(ZERO_ADDRESS)
    assert.equal(recordedETHBalance, 0)
  })

  it('getSLSDDebt(): gets the recorded SLSD balance', async () => {
    const recordedETHBalance = await defaultPool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedETHBalance, 0)
  })

  it('increaseSLSD(): increases the recorded SLSD balance by the correct amount', async () => {
    const recordedSLSD_balanceBefore = await defaultPool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceBefore, 0)

    // await defaultPool.increaseSLSDDebt(100, { from: mockTroveManagerAddress })
    const increaseSLSDDebtData = th.getTransactionData('increaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx = await mockTroveManager.forward(defaultPool.address, increaseSLSDDebtData)
    assert.isTrue(tx.receipt.status)

    const recordedSLSD_balanceAfter = await defaultPool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceAfter, 100)
  })

  it('decreaseSLSD(): decreases the recorded SLSD balance by the correct amount', async () => {
    // start the pool on 100 wei
    //await defaultPool.increaseSLSDDebt(100, { from: mockTroveManagerAddress })
    const increaseSLSDDebtData = th.getTransactionData('increaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx1 = await mockTroveManager.forward(defaultPool.address, increaseSLSDDebtData)
    assert.isTrue(tx1.receipt.status)

    const recordedSLSD_balanceBefore = await defaultPool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceBefore, 100)

    // await defaultPool.decreaseSLSDDebt(100, { from: mockTroveManagerAddress })
    const decreaseSLSDDebtData = th.getTransactionData('decreaseSLSDDebt(address,uint256)', [
      ZERO_ADDRESS,
      '0x64',
    ])
    const tx2 = await mockTroveManager.forward(defaultPool.address, decreaseSLSDDebtData)
    assert.isTrue(tx2.receipt.status)

    const recordedSLSD_balanceAfter = await defaultPool.getSLSDDebt(ZERO_ADDRESS)
    assert.equal(recordedSLSD_balanceAfter, 0)
  })

  // send raw ether
  it('sendETHToActivePool(): decreases the recorded ETH balance by the correct amount', async () => {
    // setup: give pool 2 ether
    const defaultPool_initialBalance = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    assert.equal(defaultPool_initialBalance, 0)

    // start pool with 2 ether
    // await web3.eth.sendTransaction({ from: mockActivePool.address, to: defaultPool.address, value: dec(2, 'ether') })
    const tx1 = await mockActivePool.forward(defaultPool.address, '0x', {
      from: owner,
      value: dec(2, 'ether'),
    })
    assert.isTrue(tx1.receipt.status)

    const defaultPool_BalanceBeforeTx = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    const activePool_Balance_BeforeTx = web3.utils.toBN(await web3.eth.getBalance(mockActivePool.address))

    assert.equal(defaultPool_BalanceBeforeTx, dec(2, 'ether'))

    // send ether from pool to alice
    // await defaultPool.sendETHToActivePool(dec(1, 'ether'), { from: mockTroveManagerAddress })
    const sendETHData = th.getTransactionData('sendAssetToActivePool(address,uint256)', [
      ZERO_ADDRESS,
      web3.utils.toHex(dec(1, 'ether')),
    ])
    await mockActivePool.setPayable(true)
    const tx2 = await mockTroveManager.forward(defaultPool.address, sendETHData, { from: owner })
    assert.isTrue(tx2.receipt.status)

    const defaultPool_BalanceAfterTx = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    const activePool_Balance_AfterTx = web3.utils.toBN(await web3.eth.getBalance(mockActivePool.address))

    const activePool_BalanceChange = activePool_Balance_AfterTx.sub(activePool_Balance_BeforeTx)
    const defaultPool_BalanceChange = defaultPool_BalanceAfterTx.sub(defaultPool_BalanceBeforeTx)
    assert.equal(activePool_BalanceChange, dec(1, 'ether'))
    assert.equal(defaultPool_BalanceChange, _minus_1_Ether)
  })
})

contract('Reset chain state', async (accounts) => {})
