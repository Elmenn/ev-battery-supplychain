import { SQD_CHAIN_CONFIG } from "./chain-squid-config";
import fs from "fs";

const NETWORKS = new Map<string, string>([
  ["1", "ethereum"],
  ["56", "bsc"],
  ["42161", "arbitrum"],
  ["137", "polygon"],
  ["11155111", "sepolia"],
]);
const OUTPUT_DIR = "build/";

const getNetworkConfig = (chainId: string) => {
  const networkName = NETWORKS.get(chainId);
  if (networkName == undefined) {
    throw new Error("Undefined chain id");
  }
  const config = SQD_CHAIN_CONFIG[networkName];
  if (config == undefined) throw new Error("Undefined chain id");
  return config;
};

const buildENVFile = (chainId: string) => {
  const config = getNetworkConfig(chainId);
  const templateFile = fs.readFileSync("squid.yaml.template");
  console.log({ config: config.name });
  let content = templateFile.toString("utf-8");
  content = content.replace("${squid_name}", config.name);
  content = content.replace(
    "${proxy_contract_address}",
    config.railgun_proxy_contract
  );
  content = content.replace(
    "${proxy_deployment_block}",
    config.railgun_deployment_block
  );
  content = content.replace("${rpc_proxy}", config.rpc_proxy);
  content = content.replace(
    "${poseidonT4_contract_address}",
    config.railgun_poseidonT4_contract
  );
  content = content.replace("${rpc_endpoint}", config.rpc_endpoint);
  content = content.replace("${db_name}", config.dbName);
  content = content.replace("${chainId}", config.chainId);

  const networkName = NETWORKS.get(chainId);
  const outputFile = OUTPUT_DIR + `squid-${networkName}.yaml`;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  fs.writeFileSync(outputFile, content);
  console.log(`${outputFile} file created`);
};

const compile = (chainId: string) => {
  if (chainId !== "*") buildENVFile(chainId);
  else {
    const networks = Array.from(NETWORKS.keys());
    networks.forEach((network) => {
      buildENVFile(network);
    });
  }
};

// Slice to exclude "ts-node" and script file name
const args = process.argv.slice(2);
const keyValuePairs: { [key: string]: string } = {};

args.forEach((arg) => {
  const [key, value] = arg.split("=");
  keyValuePairs[key.toLowerCase()] = value;
});

if (!keyValuePairs?.chainid) {
  console.error(
    `Invalid Command
     Usage: 
     yarn compile-chain chainId=1
     yarn compile-chain chainId=* for compiling all chain.`
  );
} else compile(keyValuePairs.chainid);

// buildENVFile(keyValuePairs.chainid)
