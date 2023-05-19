const PSYMathTester = artifacts.require('./PSYMathTester.sol')

contract('LiquityMath', async (accounts) => {
  let psyMathTester
  beforeEach('deploy tester', async () => {
    psyMathTester = await PSYMathTester.new()
  })

  const checkFunction = async (func, cond, params) => {
    assert.equal(await psyMathTester[func](...params), cond(...params))
  }

  it('max works if a > b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [2, 1])
  })

  it('max works if a = b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [2, 2])
  })

  it('max works if a < b', async () => {
    await checkFunction('callMax', (a, b) => Math.max(a, b), [1, 2])
  })
})
