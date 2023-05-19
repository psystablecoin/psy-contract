require('@nomiclabs/hardhat-truffle5')
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-etherscan')
require('solidity-coverage')
require('hardhat-gas-reporter')
require('@openzeppelin/hardhat-upgrades')
require('hardhat-contract-sizer')

const accounts = require('./hardhatAccountsList2k.js')
const accountsList = accounts.accountsList

const fs = require('fs')
const getSecret = (secretKey, defaultValue = '') => {
  const SECRETS_FILE = './secrets.js'
  let secret = defaultValue
  if (fs.existsSync(SECRETS_FILE)) {
    const { secrets } = require(SECRETS_FILE)
    if (secrets[secretKey]) {
      secret = secrets[secretKey]
    }
  }

  return secret
}

const infuraMainnetUrl = () => {
  return `https://mainnet.infura.io/v3/${getSecret('INFURA_API_KEY')}`
}

const infuraSepoliaUrl = () => {
  return `https://sepolia.infura.io/v3/${getSecret('INFURA_API_KEY')}`
}

module.exports = {
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
  },
  solidity: {
    version: '0.8.14',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      //accounts: accountsList, 
      accounts: [{privateKey:getSecret('GOERLI_DEPLOYER_PRIVATEKEY'),balance: "10000000000000000000000000"}],
      initialBaseFeePerGas: 0,
      gas: 100000000, // tx gas limit
      blockGasLimit: 150000000,
      gasPrice: 20000000000,
      hardfork: 'london',
      forking: {
        url: infuraSepoliaUrl(),
      },
      timeout: 120000000
    },

    localhost: {
      chainId: 1,
      url: 'http://127.0.0.1:8545/',
      allowUnlimitedContractSize: true,
      timeout: 1000 * 60,
    },
    mainnet: {
      url: infuraMainnetUrl(),
      accounts: [getSecret('DEPLOYER_PRIVATEKEY')],
    },
    sepolia: {
      url: infuraSepoliaUrl(),
      accounts: [getSecret('GOERLI_DEPLOYER_PRIVATEKEY')],
      timeout: 12000000
    },
    fork: {
      url: infuraSepoliaUrl(),
      accounts: [getSecret('GOERLI_DEPLOYER_PRIVATEKEY')],
      blockNumber: 3223522,
      timeout: 12000000
    },
  },
  etherscan: {
    apiKey: getSecret('ETHERSCAN_API_KEY'),
  },
  mocha: { timeout: 12000000 },
  rpc: {
    host: 'localhost',
    port: 8545,
  },
  gasReporter: {
    enabled: false,
  }
}
