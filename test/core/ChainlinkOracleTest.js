const ChainlinkOracle = artifacts.require('./ChainlinkOracleTester.sol')
const AdminContract = artifacts.require('./AdminContract.sol')
const ChainlinkOracleTestnet = artifacts.require('./ChainlinkOracleTestnet.sol')
const MockChainlink = artifacts.require('./MockAggregator.sol')
const ChainlinkFlagMock = artifacts.require('./ChainlinkFlagMock.sol')

const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants')
const testHelpers = require('../utils/testHelpers.js')
const th = testHelpers.TestHelper

const { dec, assertRevert, toBN } = th

const EMPTY_ADDRESS = '0x' + '0'.repeat(40)
const DEFAULT_PRICE = dec(100, 18)
const DEFAULT_PRICE_e8 = dec(100, 8)

contract('ChainlinkOracle', async (accounts) => {
  const [owner, alice] = accounts
  let priceFeedTestnet
  let chainlinkOracle
  let zeroAddressChainlinkOracle
  let chainFlagMock
  let mockChainlink
  let adminContract

  const setAddressesAndOracle = async () => {
    await chainlinkOracle.setAddresses(
      adminContract.address,
      EMPTY_ADDRESS,
      mockChainlink.address,
      { from: owner }
    )
  }

  const getFetchPriceWithContractValues = async () => {
    return getFetchPriceWithDifferentValue(undefined)
  }

  const getFetchPriceWithDifferentValue = async (price) => {
    if (price === undefined) price = await chainlinkOracle.lastGoodPrice()

    price = price.toString()

    return toBN(price).toString()
  }

  beforeEach(async () => {
    chainFlagMock = await ChainlinkFlagMock.new()
    ChainlinkFlagMock.setAsDeployed(chainFlagMock)

    priceFeedTestnet = await ChainlinkOracleTestnet.new()
    ChainlinkOracleTestnet.setAsDeployed(priceFeedTestnet)

    chainlinkOracle = await ChainlinkOracle.new()
    ChainlinkOracle.setAsDeployed(chainlinkOracle)

    zeroAddressChainlinkOracle = await ChainlinkOracle.new()
    ChainlinkOracle.setAsDeployed(zeroAddressChainlinkOracle)

    mockChainlink = await MockChainlink.new()
    MockChainlink.setAsDeployed(mockChainlink)

    adminContract = await AdminContract.new()
    AdminContract.setAsDeployed(adminContract)

    // Set Chainlink latest and prev round Id's to non-zero
    await mockChainlink.setLatestRoundId(3)
    await mockChainlink.setPrevRoundId(2)

    //Set current and prev prices in both oracles
    await mockChainlink.setPrice(DEFAULT_PRICE_e8)
    await mockChainlink.setPrevPrice(DEFAULT_PRICE_e8)

    await mockChainlink.setDecimals(8)

    // Set mock price updateTimes in both oracles to very recent
    const now = await th.getLatestBlockTimestamp(web3)
    await mockChainlink.setUpdateTime(now)
  })


  describe('Mainnet ChainlinkOracle setup', async (accounts) => {
    it('setAddressesAndOracle should fail after address has already been set', async () => {
      // Owner can successfully set any address
      const txOwner = await chainlinkOracle.setAddresses(
        adminContract.address, 
        EMPTY_ADDRESS,
        mockChainlink.address,
        {from: owner}
      )
      assert.isTrue(txOwner.receipt.status)

      await assertRevert(chainlinkOracle.setAddresses(
          adminContract.address, 
          EMPTY_ADDRESS,
          mockChainlink.address,
          { from: owner }
        )
      )

      await assertRevert(
        chainlinkOracle.setAddresses(
          adminContract.address, 
          EMPTY_ADDRESS,
          mockChainlink.address,
          { from: alice }
        ),
        'OwnableUpgradeable: caller is not the owner'
      )
    })
  })

  // PSY Tests :: Start
  it('Validate default status on setAddressesAndOracle', async () => {
    await setAddressesAndOracle()
    assert.equal(await chainlinkOracle.status(), '0')
  })

  it('ChainlinkWorking: Chainlink Responses are good, return price and remain same State', async () => {
    await setAddressesAndOracle()
    const statusBefore = await chainlinkOracle.status()

    await mockChainlink.setPrice(dec(1236, 8))
    await mockChainlink.setPrevPrice(dec(1234, 8))

    await chainlinkOracle.fetchPrice()
    const price = await getFetchPriceWithContractValues()

    const statusAfter = await chainlinkOracle.status()

    assert.equal(statusAfter.toString(), statusBefore.toString())
    assert.equal(price, await getFetchPriceWithDifferentValue(dec(1236, 18)))
  })

  it('ChainlinkWorking: Oracle Works, return price and remain same State', async () => {
    await setAddressesAndOracle()
    const statusBefore = await chainlinkOracle.status()

    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setPrice(dec(1234, 8))

    await chainlinkOracle.fetchPrice()
    const price = await getFetchPriceWithContractValues()
    const statusAfter = await chainlinkOracle.status()

    assert.equal(statusAfter, statusBefore.toString())
    assert.equal(price, await getFetchPriceWithDifferentValue(dec(1234, 18)))
  })

  it('ChainlinkWorking: Flag returns true, return lastGoodPrice and currentGoodIndex, state maintains working', async () => {
    await setAddressesAndOracle()
    await chainFlagMock.setFlag(true)

    const statusBefore = await chainlinkOracle.status()

    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setPrice(dec(1234, 8))

    await chainlinkOracle.fetchPrice()
    const price = await getFetchPriceWithContractValues()
    const statusAfter = await chainlinkOracle.status()

    assert.equal(+statusAfter, +statusBefore)
    assert.equal(statusAfter, '0')
    assert.equal(price, await getFetchPriceWithDifferentValue(dec(1234, 18)))
    assert.notEqual(price, await getFetchPriceWithDifferentValue(DEFAULT_PRICE))
  })

  it('ChainlinkWorking: Oracle broken, return price with lastGoodIndex, and change State to broken', async () => {
    await setAddressesAndOracle()
    const statusBefore = await chainlinkOracle.status()

    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setPrice(dec(1234, 8))
    await mockChainlink.setLatestRoundId(0)

    await chainlinkOracle.fetchPrice()
    const price = await getFetchPriceWithContractValues()

    const statusAfter = await chainlinkOracle.status()

    assert.notEqual(statusAfter, statusBefore)
    assert.equal(statusAfter, '1')
    assert.notEqual(price, await getFetchPriceWithDifferentValue(dec(1234, 18)))
    assert.equal(price, await getFetchPriceWithDifferentValue(DEFAULT_PRICE))
  })

  // PSY Tests :: End

  it('C1 Chainlink working: fetchPrice should return the correct price, taking into account the number of decimal digits on the aggregator', async () => {
    await setAddressesAndOracle()

    // Oracle price price is 10.00000000
    await mockChainlink.setDecimals(8)
    await mockChainlink.setPrevPrice(dec(1, 9))
    await mockChainlink.setPrice(dec(1, 9))
    await chainlinkOracle.fetchPrice()
    let price = await chainlinkOracle.lastGoodPrice()
    // Check Liquity ChainlinkOracle gives 10, with 18 digit precision
    assert.equal(price, dec(10, 18))

    // Oracle price is 1e9
    await mockChainlink.setDecimals(0)
    await mockChainlink.setPrevPrice(dec(1, 9))
    await mockChainlink.setPrice(dec(1, 9))
    await chainlinkOracle.fetchPrice()
    price = await chainlinkOracle.lastGoodPrice()
    // Check Liquity ChainlinkOracle gives 1e9, with 18 digit precision
    assert.isTrue(price.eq(toBN(dec(1, 27))))

    // Oracle price is 0.0001
    await mockChainlink.setDecimals(18)
    const decimals = await mockChainlink.decimals()

    await mockChainlink.setPrevPrice(dec(1, 14))
    await mockChainlink.setPrice(dec(1, 14))
    await chainlinkOracle.fetchPrice()
    price = await chainlinkOracle.lastGoodPrice()
    // Check Liquity ChainlinkOracle gives 0.0001 with 18 digit precision
    assert.isTrue(price.eq(toBN(dec(1, 14))))

    // Oracle price is 1234.56789
    await mockChainlink.setDecimals(5)
    await mockChainlink.setPrevPrice(dec(123456789))
    await mockChainlink.setPrice(dec(123456789))
    await chainlinkOracle.fetchPrice()
    price = await chainlinkOracle.lastGoodPrice()
    // Check Liquity ChainlinkOracle gives 0.0001 with 18 digit precision
    assert.equal(price, '1234567890000000000000')
  })

  // --- Chainlink timeout ---

  it('C1 chainlinkWorking: Chainlink is out of date by <3hrs: remain chainlinkWorking', async () => {
    await setAddressesAndOracle()
    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setPrice(dec(1234, 8))
    await th.fastForwardTime(10740, web3.currentProvider) // fast forward 2hrs 59 minutes

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const statusAfter = await chainlinkOracle.status()
    assert.equal(statusAfter, '0') // status 0: Chainlink working
  })

  it('C1 chainlinkWorking: Chainlink is out of date by <3hrs: return Chainklink price', async () => {
    await setAddressesAndOracle()
    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    const decimals = await mockChainlink.decimals()

    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setPrice(dec(1234, 8))
    await th.fastForwardTime(10740, web3.currentProvider) // fast forward 2hrs 59 minutes

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const price = await chainlinkOracle.lastGoodPrice()
    assert.equal(price, dec(1234, 18))
  })

  // --- Chainlink price deviation ---

  it('C1 chainlinkWorking: Chainlink price drop of 50%, remain chainlinkWorking', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(dec(1, 8)) // price drops to 1

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const statusAfter = await chainlinkOracle.status()
    assert.equal(statusAfter, '0') // status 0: Chainlink working
  })

  it('C1 chainlinkWorking: Chainlink price drop of 50%, return the Chainlink price', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(dec(1, 8)) // price drops to 1

    const priceFetchTx = await chainlinkOracle.fetchPrice()

    let price = await chainlinkOracle.lastGoodPrice()
    assert.equal(price, dec(1, 18))
  })

  it('C1 chainlinkWorking: Chainlink price drop of <50%, remain chainlinkWorking', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(dec(100000001)) // price drops to 1.00000001:  a drop of < 50% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const statusAfter = await chainlinkOracle.status()
    assert.equal(statusAfter, '0') // status 0: Chainlink working
  })

  it('C1 chainlinkWorking: Chainlink price drop of <50%, return Chainlink price', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(100000001) // price drops to 1.00000001:  a drop of < 50% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()

    let price = await chainlinkOracle.lastGoodPrice()
    assert.equal(price, dec(100000001, 10))
  })

  it('C1 chainlinkWorking: Chainlink price increase of 100%, remain chainlinkWorking', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(dec(4, 8)) // price increases to 4: an increase of 100% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const statusAfter = await chainlinkOracle.status()
    assert.equal(statusAfter, '0') // status 0: Chainlink working
  })

  it('C1 chainlinkWorking: Chainlink price increase of 100%, return Chainlink price', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(dec(4, 8)) // price increases to 4: an increase of 100% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    let price = await chainlinkOracle.lastGoodPrice()
    assert.equal(price, dec(4, 18))
  })

  it('C1 chainlinkWorking: Chainlink price increase of <100%, remain chainlinkWorking', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(399999999) // price increases to 3.99999999: an increase of < 100% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    const statusAfter = await chainlinkOracle.status()
    assert.equal(statusAfter, '0') // status 0: Chainlink working
  })

  it('C1 chainlinkWorking: Chainlink price increase of <100%,  return Chainlink price', async () => {
    await setAddressesAndOracle()
    chainlinkOracle.setLastGoodPrice(dec(2, 18))

    const statusBefore = await chainlinkOracle.status()
    assert.equal(statusBefore, '0') // status 0: Chainlink working

    await mockChainlink.setPrevPrice(dec(2, 8)) // price = 2
    await mockChainlink.setPrice(399999999) // price increases to 3.99999999: an increase of < 100% from previous

    const priceFetchTx = await chainlinkOracle.fetchPrice()
    let price = await chainlinkOracle.lastGoodPrice()
    assert.equal(price, dec(399999999, 10))
  })

  // PSY Tests :: Starts

  it('chainlinkUntrusted: Oracles is still broken, uses lastGoodPrice & lastGoodIndex and keep status', async () => {
    await setAddressesAndOracle()

    await mockChainlink.setLatestRoundId(0)
    await chainlinkOracle.fetchPrice()

    const beforeStatus = await chainlinkOracle.status()

    await mockChainlink.setPrice(dec(1234, 8))
    await mockChainlink.setPrevPrice(dec(1234, 8))
    
    await chainlinkOracle.fetchPrice()
    const afterStatus = await chainlinkOracle.status()
    const price = await getFetchPriceWithContractValues()

    assert.equal(beforeStatus, afterStatus.toString())
    assert.equal(price, await getFetchPriceWithDifferentValue(DEFAULT_PRICE))
  })

  it('chainlinUntrusted: Oracle broken, uses index, keep lastGoodPrice and keep status', async () => {
    await setAddressesAndOracle()

    await mockChainlink.setLatestRoundId(0)

    await chainlinkOracle.fetchPrice()

    const beforeStatus = await chainlinkOracle.status()

    await mockChainlink.setPrice(dec(1234, 8))
    await mockChainlink.setPrevPrice(dec(1234, 8))

    await chainlinkOracle.fetchPrice()

    const afterStatus = await chainlinkOracle.status()
    const price = await getFetchPriceWithContractValues()

    assert.equal(beforeStatus, afterStatus.toString())
    assert.equal(price, await getFetchPriceWithDifferentValue(DEFAULT_PRICE))
  })

  it('chainlinUntrusted: Oracle and Index work, uses chainlink and update status to working', async () => {
    await setAddressesAndOracle()

    await mockChainlink.setLatestRoundId(0)
    await chainlinkOracle.fetchPrice()

    await mockChainlink.setPrice(dec(1234, 8))
    await mockChainlink.setPrevPrice(dec(1234, 8))
    await mockChainlink.setLatestRoundId(4)
    await mockChainlink.setPrevRoundId(3)

    await chainlinkOracle.fetchPrice()
    const afterStatus = await chainlinkOracle.status()
    const price = await getFetchPriceWithContractValues()

    assert.equal(afterStatus, '0')
    assert.equal(price, await getFetchPriceWithDifferentValue(dec(1234, 18)))
  })

  // PSY Tests :: Ends
})
