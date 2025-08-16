const { deployments, ethers, getNamedAccounts } = require("hardhat")
const { assert, expect } = require("chai")
const { developmentChains } = require("../../helper-hardhat-config")

// testing the unit tests for the FundMe 
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("FundMe", function () {
          let fundMe
          let deployer
          let mockV3Aggregator
          const sendValue = ethers.parseEther("0.02")
          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0].address

              await deployments.fixture(["all"])

              const fundMeDeployment = await deployments.get("FundMe")
              fundMe = await ethers.getContractAt(
                  fundMeDeployment.abi,
                  fundMeDeployment.address,
              )

              const mockV3AggregatorDeployment =
                  await deployments.get("MockV3Aggregator")
              mockV3Aggregator = await ethers.getContractAt(
                  mockV3AggregatorDeployment.abi,
                  mockV3AggregatorDeployment.address,
              )
          })
          describe("constructor", async function () {
              it("sets the aggregator addresses correctly", async function () {
                  const response = await fundMe.getPriceFeed()
                  assert.equal(response, mockV3Aggregator.target)
              })
          })
          describe("fund", async function () {
              it("Fails if you dont send enough Eth", async function () {
                  await expect(fundMe.fund()).to.be.revertedWith(
                      "You need to spend more ETH!",
                  )
              })
              it("updates the amount funded data structure", async function () {
                  await fundMe.fund({ value: sendValue })
                  const response =
                      await fundMe.getAddressToAmountFunded(deployer)
                  assert.equal(response.toString(), sendValue.toString())
              })
              it("Adds funder to array of funders", async function () {
                  await fundMe.fund({ value: sendValue })
                  const response = await fundMe.getFunder(0)
                  assert.equal(response, deployer)
              })
          })

          describe("withdraw", async function () {
              beforeEach(async function () {
                  await fundMe.fund({ value: sendValue })
              })

              it("can withdraw ETH from a single founder", async function () {
                  // Arrange
                  const startingFundMeBalance =
                      await ethers.provider.getBalance(fundMe.target)
                  const startingDeployerBalance =
                      await ethers.provider.getBalance(deployer)
                  // Act
                  const transactionResponse = await fundMe.withdraw()
                  const transactionReceipt = await transactionResponse.wait(1)
                  const { gasUsed, gasPrice } = transactionReceipt

                  const gasCost = gasUsed * gasPrice

                  const endingFundMeBalance = await ethers.provider.getBalance(
                      fundMe.target,
                  )
                  const endingDeployerBalance =
                      await ethers.provider.getBalance(deployer)

                  //Assert
                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      (
                          startingFundMeBalance + startingDeployerBalance
                      ).toString(),
                      (endingDeployerBalance + gasCost).toString(),
                  )
              })

              it("allows us to withdraw with multiple funders", async function () {
                  const accounts = await ethers.getSigners()
                  for (let i = 1; i < 6; i++) {
                      const fundMeConnectedContract = await fundMe.connect(
                          accounts[i],
                      )
                      await fundMeConnectedContract.fund({ value: sendValue })
                  }
                  const startingFundMeBalance =
                      await ethers.provider.getBalance(fundMe.target)
                  const startingDeployerBalance =
                      await ethers.provider.getBalance(deployer)

                  const transactionResponse = await fundMe.withdraw()

                  const transactionReceipt = await transactionResponse.wait(1)
                  const { gasUsed, gasPrice } = transactionReceipt

                  const gasCost = gasUsed * gasPrice

                  const endingFundMeBalance = await ethers.provider.getBalance(
                      fundMe.target,
                  )
                  const endingDeployerBalance =
                      await ethers.provider.getBalance(deployer)

                  //Assert
                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      (
                          startingFundMeBalance + startingDeployerBalance
                      ).toString(),
                      (endingDeployerBalance + gasCost).toString(),
                  )

                  await expect(fundMe.getFunder(0)).to.be.reverted

                  for (i = 1; i < 6; i++) {
                      assert.equal(
                          await fundMe.getAddressToAmountFunded(accounts[i]),
                          0,
                      )
                  }
              })
              it("Only allows owners to withdraw", async function () {
                  const accounts = await ethers.getSigners()
                  const attacker = accounts[1]

                  const attackerConnectedContract =
                      await fundMe.connect(attacker)
                  await expect(attackerConnectedContract.withdraw()).to.be
                      .reverted
              })
          })
      })
