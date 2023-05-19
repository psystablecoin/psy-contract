const { ethers } = require("hardhat");
const configParams = require("../deploymentParams/deploymentParams.mainnet.js")
const DeploymentHelper = require("../helpers/deploymentHelpers.js")


async function main() {
    console.log("Deploying LockedPSY");

    config = configParams;
    deployerWallet = (await ethers.getSigners())[0];

    mdh = new DeploymentHelper(config, deployerWallet)
    deploymentState = mdh.loadPreviousDeployment()

    const LockedPSY = await ethers.getContractFactory("LockedPSY");
    const LockedPSYInstance = await mdh.loadOrDeploy(LockedPSY, "LockedPSY", deploymentState);

    await mdh.verifyContract("LockedPSY", deploymentState, [], false);

    await mdh.isOwnershipRenounced(LockedPSYInstance) ||
        await mdh.sendAndWaitForTransaction(LockedPSYInstance.setAddresses(
            deploymentState["PSYToken"].address,
            { gasPrice: config.GAS_PRICE }))

    await mdh.sendAndWaitForTransaction(
        LockedPSYInstance.transferOwnership(
            config.psyAddresses.ADMIN_MULTI,
            { gasPrice: config.GAS_PRICE }
        ))

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });