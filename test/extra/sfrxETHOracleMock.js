const { expect } = require('hardhat')
const { expectRevert } = require('@openzeppelin/test-helpers')

describe('sfrxETHOracleMock', function () {
    const defaultETHPrice = "1900000000000000000000"
    const defaultFRXETHPrice = "1000000000000000000"

    beforeEach(async function () {
        [Owner, Account1, Account2, weth, frxETH, sfrxETH] = await ethers.getSigners()

        const SfrxETHOracleTestContract = await ethers.getContractFactory('SfrxETHOracleTest')
        sampleOracle = await SfrxETHOracleTestContract.deploy(weth.address, frxETH.address, sfrxETH.address)

        //await sampleOracle.fetchPrice()
    })

    describe('defualt stats checkup', function () {
        it('sets default settings', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address)).to.equal(true)
        })
    })


    describe('volatility params', function () {
        it('set and get deviation allowance', async function () {
            const result1 = await sampleOracle.maxDeviationAllowance()
            expect(result1.toString()).to.equal(String(3e16))
            await sampleOracle.setDeviationAlloance(String(5e16))
            const result2 = await sampleOracle.maxDeviationAllowance()
            expect(result2.toString()).to.equal(String(5e16))
        })

        it('set and get frequency', async function () {
            const result1A = await sampleOracle.getCheckFrequency(frxETH.address)
            const result1B = await sampleOracle.getCheckFrequency(sfrxETH.address)
            expect(result1A.toString()).to.equal(String(3600))
            expect(result1B.toString()).to.equal(String(86400))
            await sampleOracle.setCheckFrequency(frxETH.address,String(10000))
            await sampleOracle.setCheckFrequency(sfrxETH.address,String(20000))
            const result2A = await sampleOracle.getCheckFrequency(frxETH.address)
            const result2B = await sampleOracle.getCheckFrequency(sfrxETH.address)
            expect(result2A.toString()).to.equal(String(10000))
            expect(result2B.toString()).to.equal(String(20000))
        })
    })

    describe('keeper', function () {
        it('only owner can set keeper', async function () {
            await expectRevert.unspecified(sampleOracle.connect(Account1).setKeeper(Account1.address))
            await sampleOracle.setKeeper(Account1.address)
            expect(await sampleOracle.keeper()).to.equal(Account1.address)
        })

        it('only keeper can set rates', async function () {
            await expectRevert.unspecified(sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e17)))
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18 - 1))
            const rate = await sampleOracle.getRate(frxETH.address)
            expect(rate.toString()).to.equal(String(1e18 - 1))
        })

        it('only registered tokens can have rates', async function () {
            await sampleOracle.setKeeper(Account1.address)
            await expectRevert.unspecified(sampleOracle.connect(Account1).commitRate(weth.address,String(1e17)))
        })
    })
    
    describe('sfrxETH Rate', function () {
        it('requires price update once time has passed', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address)).to.equal(true)
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(sfrxETH.address,String(1e18))
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address)).to.equal(false)
            await network.provider.send('evm_increaseTime', [90000])  //24 hours + buffer
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address)).to.equal(true)
        })
    })

    describe('frxETH Rate', function () {
        it('requires price update once time has passed', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(false)
            await network.provider.send('evm_increaseTime', [700])  // less than 1 hours
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(false)
            await network.provider.send('evm_increaseTime', [3000])  // less than 1 hours
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
        })
        it('requires price update if deviation is larger than settings', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(false)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e17))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e19))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(true)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18))
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 - 1e18 * 0.03))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(false)
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 + 1e18 * 0.03))
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address)).to.equal(false)
        })
    })

    describe('getDirectPrice', function () {
        it('change the result if sfrxETH rate changed', async function () {
            await sampleOracle.commitRate(frxETH.address, String(1e18))
            await sampleOracle.commitRate(sfrxETH.address, String(1e18))
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(sfrxETH.address, String(1e18 * 0.97))
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(sfrxETH.address, String(1e18 * 1.03))
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
        })
        it('change the result if frxETH rate changed', async function () {
            await sampleOracle.commitRate(frxETH.address, String(1e18))
            await sampleOracle.commitRate(sfrxETH.address, String(1e18))
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 - 1e18 * 0.03))
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 + 1e18 * 0.03))
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
        })
        it('change the result if weth price changed', async function () {
            await sampleOracle.commitRate(frxETH.address, String(1e18))
            await sampleOracle.commitRate(sfrxETH.address, String(1e18))
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setWethPrice(String(1e18))
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setWethPrice(String(3e18))
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
            
        })
        it('reverts if frxETH prices on L1 and L2 deviate too much', async function () {
            await sampleOracle.commitRate(sfrxETH.address, String(1e18))
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 0.99))
            await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 0.95))
            await expectRevert.unspecified(sampleOracle.getDirectPrice())
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 1.01))
            await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 1.05))
            await expectRevert.unspecified(sampleOracle.getDirectPrice())
        })
    })

})
