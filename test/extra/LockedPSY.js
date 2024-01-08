const { expect } = require('hardhat')

describe('Locked PSY', function () {
  let PSYToken
  let LockedPSY

  beforeEach(async function () {
    ;[Owner, Account1, Account2] = await ethers.getSigners()

    const PSYTokenFactory = await ethers.getContractFactory('PSYToken')
    PSYToken = await PSYTokenFactory.deploy(Owner.address)

    const LockedPSYFactory = await ethers.getContractFactory('LockedPSY')
    LockedPSY = await LockedPSYFactory.deploy()
    await LockedPSY.setAddresses(PSYToken.address)
  })

  describe('Add vesting', function () {
    it('Can add a vesting address', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 1000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      const rule = await LockedPSY.entitiesVesting(vestingAddress)

      const blockNumBefore = await ethers.provider.getBlockNumber()
      const blockBefore = await ethers.provider.getBlock(blockNumBefore)
      const timestampBefore = blockBefore.timestamp

      expect(rule.totalSupply.toNumber()).to.equal(vestingAmount)
      expect(rule.startVestingDate.toNumber()).to.equal(timestampBefore + 31_536_000)
      expect(rule.endVestingDate.toNumber()).to.equal(timestampBefore + 63_072_000)
      expect(rule.claimed.toNumber()).to.equal(0)
    })

    it('Can add a vesting addresses batch', async function () {
      const vestingAddress1 = Account1.address
      const vestingAddress2 = Account2.address

      const vestingAmount1 = 1000
      const vestingAmount2 = 2000

      await PSYToken.approve(LockedPSY.address, vestingAmount1 + vestingAmount2)

      await LockedPSY.addEntityVestingBatch(
        [vestingAddress1, vestingAddress2],
        [vestingAmount1, vestingAmount2]
      )

      const rule1 = await LockedPSY.entitiesVesting(vestingAddress1)
      const rule2 = await LockedPSY.entitiesVesting(vestingAddress2)

      const blockNumBefore = await ethers.provider.getBlockNumber()
      const blockBefore = await ethers.provider.getBlock(blockNumBefore)
      const timestampBefore = blockBefore.timestamp

      expect(rule1.totalSupply.toNumber()).to.equal(vestingAmount1)
      expect(rule1.startVestingDate.toNumber()).to.equal(timestampBefore + 31_536_000)
      expect(rule1.endVestingDate.toNumber()).to.equal(timestampBefore + 63_072_000)
      expect(rule1.claimed.toNumber()).to.equal(0)

      expect(rule2.totalSupply.toNumber()).to.equal(vestingAmount2)
      expect(rule2.startVestingDate.toNumber()).to.equal(timestampBefore + 31_536_000)
      expect(rule2.endVestingDate.toNumber()).to.equal(timestampBefore + 63_072_000)
      expect(rule2.claimed.toNumber()).to.equal(0)
    })
  })

  describe('claimable amount', function () {
    it('can get zero claimable amount', async function () {
      const claimableAmount = await LockedPSY.getClaimablePSY(Owner.address)
      expect(claimableAmount.toNumber()).to.equal(0)
    })
    it('can get claimable amount', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 100000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      const claimableAmount = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount.toNumber()).to.equal(0)
      await network.provider.send('evm_increaseTime', [31536000])
      await network.provider.send('evm_mine')

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount2 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount2.toNumber()).to.equal(25000)

      await network.provider.send('evm_increaseTime', [15_768_000])
      await network.provider.send('evm_mine')

      const claimableAmount3 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount3.toNumber()).to.equal(75000)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount4 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount4.toNumber()).to.equal(100000)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount5 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount5.toNumber()).to.equal(100000)
    })
    it('can claim amount', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 100000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      await network.provider.send('evm_increaseTime', [31_536_000])
      await network.provider.send('evm_mine')

      await LockedPSY.connect(Account1).claimPSYToken()

      const balance = await PSYToken.balanceOf(vestingAddress)

      expect(balance.toNumber()).to.equal(0)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      await LockedPSY.connect(Account1).claimPSYToken()

      const balance2 = await PSYToken.balanceOf(vestingAddress)

      expect(balance2.toNumber()).to.equal(25000)

      await network.provider.send('evm_increaseTime', [15_768_000])
      await network.provider.send('evm_mine')

      await LockedPSY.connect(Account1).claimPSYToken()

      const balance3 = await PSYToken.balanceOf(vestingAddress)

      expect(balance3.toNumber()).to.equal(75000)

      await network.provider.send('evm_increaseTime', [15_768_000])
      await network.provider.send('evm_mine')

      await LockedPSY.connect(Account1).claimPSYToken()

      const balance4 = await PSYToken.balanceOf(vestingAddress)

      expect(balance4.toNumber()).to.equal(100000)
    })
  })

  describe('Lower and remove vesting', function () {
    it('can lower vesting', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 100000
      const lowerAmount = 75000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      await network.provider.send('evm_increaseTime', [47_304_000])
      await network.provider.send('evm_mine')

      await LockedPSY.lowerEntityVesting(vestingAddress, lowerAmount)

      const balance = await PSYToken.balanceOf(vestingAddress)

      expect(balance.toNumber()).to.equal(50000)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount.toNumber()).to.equal(6250)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount2 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount2.toNumber()).to.equal(25000)
    })

    it('can lower vesting before start', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 100000
      const lowerAmount = 75000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      await network.provider.send('evm_increaseTime', [15_768_000])
      await network.provider.send('evm_mine')

      await LockedPSY.lowerEntityVesting(vestingAddress, lowerAmount)

      const balance = await PSYToken.balanceOf(vestingAddress)

      expect(balance.toNumber()).to.equal(0)

      await network.provider.send('evm_increaseTime', [31_536_000])
      await network.provider.send('evm_mine')

      const claimableAmount2 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount2.toNumber()).to.equal(37500)

      await network.provider.send('evm_increaseTime', [31_536_000])
      await network.provider.send('evm_mine')

      const claimableAmount3 = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount3.toNumber()).to.equal(75000)
    })

    it('can remove vesting', async function () {
      const vestingAddress = Account1.address
      const vestingAmount = 100000

      await PSYToken.approve(LockedPSY.address, vestingAmount)

      await LockedPSY.addEntityVesting(vestingAddress, vestingAmount)

      await network.provider.send('evm_increaseTime', [47_304_000])
      await network.provider.send('evm_mine')

      await LockedPSY.removeEntityVesting(vestingAddress)

      const balance = await PSYToken.balanceOf(vestingAddress)

      expect(balance.toNumber()).to.equal(50000)

      await network.provider.send('evm_increaseTime', [7_884_000])
      await network.provider.send('evm_mine')

      const claimableAmount = await LockedPSY.getClaimablePSY(vestingAddress)

      expect(claimableAmount.toNumber()).to.equal(0)

      const unassigned = await LockedPSY.getUnassignPSYTokensAmount()

      expect(unassigned.toNumber()).to.equal(50000)

      const balanceOwnerBefore = await PSYToken.balanceOf(Owner.address)

      await LockedPSY.transferUnassignedPSY()

      const balanceOwnerAfter = await PSYToken.balanceOf(Owner.address)

      expect(balanceOwnerAfter.sub(balanceOwnerBefore).toNumber()).to.equal(50000)
    })
  })
})
