const ChainlinkOracle = artifacts.require('./ChainlinkOracleTester.sol')
const AdminContract = artifacts.require('./AdminContract.sol')
const ChainlinkOracleTestnet = artifacts.require('./ChainlinkOracleTestnet.sol')
const MockChainlink = artifacts.require('./MockAggregator.sol')
const PriceFeed = artifacts.require('./PriceFeed.sol')

const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants')
const testHelpers = require('../utils/testHelpers.js')
const th = testHelpers.TestHelper

const { dec, assertRevert, toBN } = th

const EMPTY_ADDRESS = '0x' + '0'.repeat(40)
const DEFAULT_PRICE_e8 = dec(100, 8)

contract('PriceFeed', async (accounts) => {
  const [owner, alice] = accounts
  let chainlinkOracle
  let zeroAddressChainlinkOracle
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

    await setAddressesAndOracle()

    pricefeed = await PriceFeed.new()
    PriceFeed.setAsDeployed(pricefeed)

    await pricefeed.setAddresses(adminContract.address)
  })


  it('addOracle as User: Reverts', async () => {
    await assertRevert(
      pricefeed.addOracle(EMPTY_ADDRESS, chainlinkOracle.address, { from: alice }),
      'Invalid Permission'
    )
  })

  it('reverts when trying to fetch price for unauthorized asset', async () => {
    await assertRevert(
      pricefeed.fetchPrice(EMPTY_ADDRESS),
      'Asset is not registered!'
    )
  })

  it('reverts when trying to fetch price for unauthorized asset', async () => {
    await pricefeed.addOracle(adminContract.address, chainlinkOracle.address, { from: owner })
    const price = await pricefeed.getDirectPrice(adminContract.address)
    assert.equal(price.toString(), dec(100, 18))
  })

})
