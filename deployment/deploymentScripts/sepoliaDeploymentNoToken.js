const { mainnetDeploy } = require('./testnetDeploymentNoToken.js')
const configParams = require("../deploymentParams/deploymentParams.sepolia.js")

async function main() {
  console.log("Deploying on testnet");
  await mainnetDeploy(configParams)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
