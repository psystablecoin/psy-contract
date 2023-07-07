const { expect } = require('hardhat')

describe('sfrxETHOracleMock', function () {
    const defaultETHPrice = "1900000000000000000000"
    const defaultFRXETHPrice = "1000000000000000000"

    beforeEach(async function () {
        ;[Owner, Account1, Account2] = await ethers.getSigners()

        const SfrxETHOracleTestContract = await ethers.getContractFactory('SfrxETHOracleTest')
        sampleOracle = await SfrxETHOracleTestContract.deploy()

        await sampleOracle.setPriceMock(0, defaultETHPrice)
        await sampleOracle.setPriceMock(1, defaultFRXETHPrice)

        await sampleOracle.fetchPrice()
    })

    describe('defualt stats checkup', function () {
        it('WETH Price in usdc', async function () {
            const price = await sampleOracle.getDirectPrice()
            //the price is default
            expect(price.toString()).to.equal(defaultETHPrice)
        })
    
    })

    describe('When price move down within the range', function () {
        it('WETH Price down to 1800', async function () {
            const newPrice = "1850000000000000000000"
            await sampleOracle.setPriceMock(0, newPrice)
            await sampleOracle.fetchPrice()
            const price0 = await sampleOracle.getDirectPrice()
            //price is changed to the latest price
            expect(price0.toString()).to.equal(newPrice)
            await network.provider.send('evm_increaseTime', [300])
            await network.provider.send('evm_mine')
            const price1 = await sampleOracle.getDirectPrice()
            //price is same as the latest price record
            expect(price1.toString()).to.equal(newPrice)
        })
    })

    describe('When price move up within the range', function () {
        it('WETH Price down to 1950', async function () {
            const newPrice = "1950000000000000000000"
            await sampleOracle.setPriceMock(0, newPrice)
            await sampleOracle.fetchPrice()
            const price0 = await sampleOracle.getDirectPrice()
            //price is changed to the latest price
            expect(price0.toString()).to.equal(newPrice)
            await network.provider.send('evm_increaseTime', [300])
            await network.provider.send('evm_mine')
            const price1 = await sampleOracle.getDirectPrice()
            //price is same as the latest price record
            expect(price1.toString()).to.equal(newPrice)
        })
    })

    describe('When price move down out of the range', function () {
        it('WETH Price down to 1000', async function () {
            const newPrice = "1000000000000000000000"
            await sampleOracle.setPriceMock(0, newPrice)
            await sampleOracle.fetchPrice()
            const price0 = await sampleOracle.getDirectPrice()
            //price is changed but not reflected as volatility is too high
            expect(price0.toString()).to.not.equal(newPrice)
            await network.provider.send('evm_increaseTime', [240])
            await network.provider.send('evm_mine')
            await sampleOracle.fetchPrice()
            const price1 = await sampleOracle.getDirectPrice()
            //price is not changed and finally reflected after 5 min
            expect(price1.toString()).to.not.equal(newPrice)
            await network.provider.send('evm_increaseTime', [60])
            await network.provider.send('evm_mine')
            await sampleOracle.fetchPrice()
            const price2 = await sampleOracle.getDirectPrice()
            //price is finally finally reflected after 5 min
            expect(price2.toString()).to.equal(newPrice)
        })
    })

    describe('When price move up out of the range', function () {
        it('WETH Price down to 3000', async function () {
            const newPrice = "3000000000000000000000"
            await sampleOracle.setPriceMock(0, newPrice)
            await sampleOracle.fetchPrice()
            const price0 = await sampleOracle.getDirectPrice()
            //price is changed but not reflected as volatility is too high
            expect(price0.toString()).to.not.equal(newPrice)
            await network.provider.send('evm_increaseTime', [240])
            await network.provider.send('evm_mine')
            await sampleOracle.fetchPrice()
            const price1 = await sampleOracle.getDirectPrice()
            //price is not changed and reflected after 4 min
            expect(price1.toString()).to.not.equal(newPrice)
            await network.provider.send('evm_increaseTime', [60])
            await network.provider.send('evm_mine')
            await sampleOracle.fetchPrice()
            const price2 = await sampleOracle.getDirectPrice()
            //price is finally finally reflected after 5 min
            expect(price2.toString()).to.equal(newPrice)
        })
    })
})
