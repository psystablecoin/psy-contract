const { expect } = require('hardhat')

describe('sfrxETHOracle: To do this test, change hardhat config to arbitrum fork network', function () {
    let sfrxETHOracle;
    let WETHUSDC = '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443';
    let frxETHWETH = '0x3932192de4f17dfb94be031a8458e215a44bf560';
	let weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
	let usdc = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8';

    beforeEach(async function () {
        ;[Owner, Account1, Account2] = await ethers.getSigners()

        const sfrxETHOracleContract = await ethers.getContractFactory('sfrxETHOracle')
        sfrxETHOracle = await sfrxETHOracleContract.deploy(
            WETHUSDC,
            frxETHWETH,
            weth,
            usdc
        )

        const SfrxETHOracleTestContract = await ethers.getContractFactory('SfrxETHOracleTest')
        sampleOracle = await SfrxETHOracleTestContract.deploy()
    })

    describe('returns each price', function () {
        
        it('WETH Price in usdc', async function () {
            const result = await sampleOracle.priceUniV3(usdc, WETHUSDC)
            console.log(result.toString())
        })
        
        it('frxETH Price in WETH', async function () {
            const result = await sampleOracle.priceRamses(weth, frxETHWETH)
            console.log(result.toString())
        })
    })

    describe('returns sfrxETH price', function () {
        
        it('When sfrxETH = frxETH', async function () {
            const result = await sfrxETHOracle.getDirectPrice()
            console.log(result.toString())
        })

        it('When sfrxETH =  2 frxETH', async function () {
            await sfrxETHOracle.commitRates("2000000000000000000")
            const result = await sfrxETHOracle.getDirectPrice()
            console.log(result.toString())
        })
        
    })
})
