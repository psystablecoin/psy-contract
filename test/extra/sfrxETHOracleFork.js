const { expect } = require('hardhat')

describe('sfrxETHOracle: To do this test, change hardhat config to arbitrum fork network', function () {
    let sfrxETHOracle;
    let chainlink;
    let chainlinkAddress = "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612"
    let WETHUSDC = '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443';
    let frxETHWETH = '0x3932192de4f17dfb94be031a8458e215a44bf560';
	let weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
	let usdc = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8';
    let frxETH = "0x178412e79c25968a32e89b11f63B33F733770c2A"
    let sfrxETH = "0x95aB45875cFFdba1E5f451B950bC2E42c0053f39"

    beforeEach(async function () {
        ;[Owner, Account1, Account2] = await ethers.getSigners()

        const sfrxETHOracleContract = await ethers.getContractFactory('sfrxETHOracle')
        const chainlinkContract = await ethers.getContractFactory('ChainlinkOracle')
        chainlink = await chainlinkContract.deploy()
        await chainlink.setAddresses(weth, weth, chainlinkAddress)
        sfrxETHOracle = await sfrxETHOracleContract.deploy(
            frxETHWETH,
            weth,
            frxETH, 
            sfrxETH,
            chainlink.address
        )

        const SfrxETHOracleTestContract = await ethers.getContractFactory('SfrxETHOracleTest')
        sampleOracle = await SfrxETHOracleTestContract.deploy(weth,frxETH, sfrxETH)
    })

    describe('returns each price', function () {
        
        it('frxETH Price in WETH', async function () {
            const result = await sampleOracle.priceRamses(weth, frxETHWETH)
            console.log(result.toString())
        })
    })

    describe('returns sfrxETH price', function () {
        
        it('When sfrxETH = frxETH', async function () {
            await sfrxETHOracle.commitRate(frxETH, String(1e18))
            await sfrxETHOracle.commitRate(sfrxETH, String(1e18))
            const result = await sfrxETHOracle.getDirectPrice()
            console.log(result.toString())
        })
        
    })
})
