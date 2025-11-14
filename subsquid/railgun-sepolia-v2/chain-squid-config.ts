export interface ChainConfig {
  name: string;
  chainId: string;
  railgun_proxy_contract: string;
  railgun_deployment_block: string;
  railgun_poseidonT4_contract: string;
  rpc_proxy: string;
  rpc_endpoint: string;
  dbName: string;
}

export const SQD_CHAIN_CONFIG: { [network: string]: ChainConfig } = {
  ethereum: {
    name: "squid-railgun-ethereum-v2",
    chainId: "1",
    railgun_proxy_contract: "0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9",
    railgun_deployment_block: "14693013",
    railgun_poseidonT4_contract: "0xcb2ebd9fcb570db7b4f723461efce7e1f3b5b5a3",
    rpc_proxy: "eth.http",
    rpc_endpoint: "${{secrets.RAILGUN_ETH_RPC}}",
    dbName: "squid-railgun-ethereum-v2"
  },
  bsc: {
    name: "squid-railgun-bsc-v2",
    chainId: "56",
    railgun_proxy_contract: "0x590162bf4b50f6576a459b75309ee21d92178a10",
    railgun_deployment_block: "17431925",
    railgun_poseidonT4_contract: "0xa214D47E24De000dcDC83Ef6cda192E5fc74A067",
    rpc_proxy: "bsc.http",
    rpc_endpoint: "${{secrets.RAILGUN_BSC_RPC}}",
    dbName: "squid-railgun-bsc-v2"
  },
  arbitrum: {
    name: "squid-railgun-arbitrum-v2",
    chainId: "42161",
    railgun_proxy_contract: "0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9",
    railgun_deployment_block: "56109834",
    railgun_poseidonT4_contract: "0x753f0F9BA003DDA95eb9284533Cf5B0F19e441dc",
    rpc_proxy: "arbitrum-one.http",
    rpc_endpoint: "${{secrets.RAILGUN_ARB_RPC}}",
    dbName: "squid-railgun-arbitrum-v2"
  },
  polygon: {
    name: "squid-railgun-polygon-v2",
    chainId: "137",
    railgun_proxy_contract: "0x19b620929f97b7b990801496c3b361ca5def8c71",
    railgun_deployment_block: "27803253",
    railgun_poseidonT4_contract: "0x6859c40bcb6a99d84250153b3463072e93b1195e",
    rpc_proxy: "polygon.http",
    rpc_endpoint: "${{secrets.RAILGUN_POLY_RPC}}",
    dbName: "squid-railgun-polygon-v2"
  },
  sepolia: {
    name: "squid-railgun-eth-sepolia-v2",
    chainId: "11155111",
    railgun_proxy_contract: "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea",
    railgun_deployment_block: "5784866",
    railgun_poseidonT4_contract: "0xA8c1DA10b822c3e5697FE476C0A9ECd98FFeB442",
    rpc_proxy: "eth-sepolia:http",
    rpc_endpoint: "${{secrets.RAILGUN_SEPOLIA_RPC}}",
    dbName: "squid-railgun-eth-sepolia-v2"
  }
};
