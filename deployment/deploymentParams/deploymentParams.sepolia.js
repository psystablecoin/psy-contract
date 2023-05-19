const IsMainnet = false;

const externalAddrs = {
  // https://data.chain.link/eth-usd
  CHAINLINK_ETHUSD_PROXY: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  CHAINLINK_BTCUSD_PROXY: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  CHAINLINK_FLAG_HEALTH: "0x491B1dDA0A8fa069bbC1125133A975BF4e85a91b",
  CHAINLINK_USSLSD_PROXY: "0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910",

  WETH_ERC20: "0x2369e3fc8aab577ab2a59d20623ddaf99d634a7a",
  WRP_BTC: "0x2958d9f9debb1e4a33044338456a0a41a966d119",
}


const psyAddresses = {
  ADMIN_MULTI: "0x9a8C847ed0ABb000501fB6b8d8E0fF9bcDd24dCb",
  PSY_SAFE: "0x9a8C847ed0ABb000501fB6b8d8E0fF9bcDd24dCb", // TODO
  DEPLOYER: "0x9a8C847ed0ABb000501fB6b8d8E0fF9bcDd24dCb"
}

const psyCommunityIssuanceParams = {
  ETH_STABILITY_POOL_FUNDING: 0,
  BTC_STABILITY_POOL_FUNDING: 0,
  ETH_STABILITY_POOL_WEEKLY_DISTRIBUTION: 0,
  BTC_STABILITY_POOL_WEEKLY_DISTRIBUTION: 0,
}

const REDEMPTION_SAFETY = 14;

// 1 = Deploy PSY token, 2 = Deploy SLSD Core contracts
const DEPLOYMENT_PHASE = 2;

const OUTPUT_FILE = './deployment/output/sepoliaDeploymentOutput.json'

const delay = ms => new Promise(res => setTimeout(res, ms));
const waitFunction = async () => {
  return delay(90000) // wait 90s
}

const GAS_PRICE = 25000000000
const TX_CONFIRMATIONS = 1
const treasuryAddress = "0x9a8C847ed0ABb000501fB6b8d8E0fF9bcDd24dCb"

const ETHERSCAN_BASE_URL = 'https://sepolia.etherscan.io/address'

module.exports = {
  externalAddrs,
  psyAddresses,
  psyCommunityIssuanceParams,
  OUTPUT_FILE,
  waitFunction,
  GAS_PRICE,
  TX_CONFIRMATIONS,
  ETHERSCAN_BASE_URL,
  treasuryAddress,
  IsMainnet,
  REDEMPTION_SAFETY,
  DEPLOYMENT_PHASE
};
