const { expect, ethers } = require('hardhat')
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
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, 1)).to.equal(true)
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address, 1)).to.equal(true)
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
            let time = Math.floor(Date.now()/1000)
            await expectRevert.unspecified(sampleOracle.connect(Account1).commitRate(frxETH.address, String(1e17), String(time)))
            await expectRevert.unspecified(sampleOracle.connect(Account1).commitRate(frxETH.address, String(1e17), String(time + 30)))
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18 - 1), String(time))
            const rate = await sampleOracle.getRate(frxETH.address)
            expect(rate.toString()).to.equal(String(1e18 - 1))
        })

        it('only registered tokens can have rates', async function () {
            let time = Math.floor(Date.now()/1000)
            await sampleOracle.setKeeper(Account1.address)
            await expectRevert.unspecified(sampleOracle.connect(Account1).commitRate(weth.address,String(1e17),String(time)))
        })
    })
    
    describe('sfrxETH Rate', function () {
        it('requires price update once time has passed', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address, 1)).to.equal(true)
            let time = Math.floor(Date.now()/1000)
            await sampleOracle.setKeeper(Account1.address)
            await sampleOracle.connect(Account1).commitRate(sfrxETH.address,String(1e18),time)
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address, String(1e18))).to.equal(false)
            await network.provider.send('evm_increaseTime', [90000])  //24 hours + buffer
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(sfrxETH.address, String(1e18))).to.equal(true)
        })
    })

    describe('frxETH Rate', function () {
        it('requires price update once time has passed', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, 1)).to.equal(true)
            await sampleOracle.setKeeper(Account1.address)
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18), time)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18), time + 1)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18))).to.equal(false)
            await network.provider.send('evm_increaseTime', [700])  // less than 1 hours
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18))).to.equal(false)
            await network.provider.send('evm_increaseTime', [3000])  // less than 1 hours
            await network.provider.send('evm_mine')
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18))).to.equal(true)
        })
        it('requires price update if deviation is larger than the previous commit', async function () {
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, 1)).to.equal(true)
            await sampleOracle.setKeeper(Account1.address)
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18), time)
            await sampleOracle.connect(Account1).commitRate(frxETH.address,String(1e18), time + 1)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18))).to.equal(false)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e19))).to.equal(true)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e17))).to.equal(true)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18 + 1e18 * 0.015))).to.equal(false)
            expect(await sampleOracle.isRateUpdateNeeded(frxETH.address, String(1e18 - 1e18 * 0.015))).to.equal(false)
        })
    })

    describe('getDirectPrice', function () {
        it('change the result if sfrxETH rate changed', async function () {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.commitRate(frxETH.address, String(1e18), time)
            await sampleOracle.commitRate(sfrxETH.address, String(1e18), time)
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(sfrxETH.address, String(1e18 * 0.97),time + 1)
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(sfrxETH.address, String(1e18 * 1.03), time + 2)
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
        })
        it('change the result if frxETH rate changed', async function () {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.commitRate(frxETH.address, String(1e18), time)
            await sampleOracle.commitRate(sfrxETH.address, String(1e18), time + 1)
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 - 1e18 * 0.03))
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setFrxETHPrice(String(1e18 + 1e18 * 0.03))
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
        })
        it('change the result if weth price changed', async function () {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.commitRate(frxETH.address, String(1e18), time)
            await sampleOracle.commitRate(sfrxETH.address, String(1e18), time + 1)
            const original = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setWethPrice(String(1e18))
            const lower = await sampleOracle.getDirectPrice()
            await sampleOracle.connect(Account1).setWethPrice(String(3e18))
            const upper = await sampleOracle.getDirectPrice()
            expect(lower.toString()).to.not.equal(original.toString())
            expect(upper.toString()).to.not.equal(original.toString())
            
        })
        it('reverts if frxETH prices on L1 and L2 deviate too much', async function () {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.commitRate(sfrxETH.address, String(1e18), time)
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 0.99), time + 1)
            await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 0.95), time + 2)
            await expectRevert.unspecified(sampleOracle.getDirectPrice())
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 1.01), time + 3)
            await sampleOracle.getDirectPrice()
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 1.05), time + 4)
            await expectRevert.unspecified(sampleOracle.getDirectPrice())
        })
        it('reverts if sfrxETH prices update is past', async function () {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const time = blockBefore.timestamp;
            await sampleOracle.commitRate(sfrxETH.address, String(1e18), time)
            await sampleOracle.commitRate(frxETH.address, String(1e18 * 0.99), time + 1)
            await sampleOracle.getDirectPrice()
            await network.provider.send('evm_increaseTime', [86400 + 31 * 60])  // add 1 day + 31 min
            await network.provider.send('evm_mine')
            await expectRevert.unspecified(sampleOracle.getDirectPrice())        
        })
    })

})
