const { expect, ethers } = require('hardhat')

describe('chainlink: To do this test, change hardhat config to arbitrum fork network', function () {
    let rETHOracle;
    let wstETHOracle;
    let rETHChainlink = "0xf3272cafe65b190e76caaf483db13424a3e23dd2"
    let wstETHChainlink = '0xb523ae262d20a936bc152e6023996e46fdc2a95d'
    let ETHChainlink = '0x639fe6ab55c921f74e7fac1ee960c0b6293ba612';

    beforeEach(async function () {
        ;[Owner, Account1, Account2] = await ethers.getSigners()

        const ChainlinkOracleSimple = await ethers.getContractFactory('ChainlinkOracleSimple')
        rETHOracle = await ChainlinkOracleSimple.deploy(rETHChainlink, ETHChainlink)
        wstETHOracle = await ChainlinkOracleSimple.deploy(wstETHChainlink, ETHChainlink)

    })

    describe('returns each price', function () {
        
        it('rETH Price in USD', async function () {
            const result = await rETHOracle.getDirectPrice()
            console.log(result.toString())
        })

        it('wstETH price in USD', async function () {
            const result = await wstETHOracle.getDirectPrice()
            console.log(result.toString())
        })
    })


})
