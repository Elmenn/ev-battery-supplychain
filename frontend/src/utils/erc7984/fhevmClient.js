import { ethers } from "ethers";

let sdkModulePromise = null;
let sdkInitializedPromise = null;

async function getSdkModule() {
  if (!sdkModulePromise) {
    sdkModulePromise = import("@zama-fhe/relayer-sdk/web");
  }
  return sdkModulePromise;
}

async function ensureSdkInitialized() {
  if (!sdkInitializedPromise) {
    sdkInitializedPromise = (async () => {
      const { initSDK } = await getSdkModule();
      await initSDK();
      return true;
    })();
  }
  return sdkInitializedPromise;
}

async function getSupportedConfig(provider) {
  const { SepoliaConfig } = await getSdkModule();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 11155111) {
    throw new Error(`Browser fhevm client is only wired for Sepolia right now. Current chainId: ${chainId}`);
  }

  if (!window.ethereum) {
    throw new Error("window.ethereum is required for the browser fhevm client.");
  }

  return {
    chainId,
    config: {
      ...SepoliaConfig,
      network: window.ethereum,
    },
  };
}

export async function getBrowserFhevmInstance(provider) {
  if (!provider) {
    throw new Error("provider is required");
  }

  await ensureSdkInitialized();
  const { createInstance } = await getSdkModule();
  const { config } = await getSupportedConfig(provider);
  return createInstance(config);
}

export async function encryptUint64ForContract({ provider, contractAddress, userAddress, value }) {
  if (!contractAddress) {
    throw new Error("contractAddress is required");
  }
  if (!userAddress) {
    throw new Error("userAddress is required");
  }

  const checksummedContractAddress = ethers.getAddress(contractAddress);
  const checksummedUserAddress = ethers.getAddress(userAddress);
  const instance = await getBrowserFhevmInstance(provider);
  const encryptedInput = instance.createEncryptedInput(
    checksummedContractAddress,
    checksummedUserAddress
  );
  encryptedInput.add64(BigInt(value));
  const encrypted = await encryptedInput.encrypt();

  return {
    handle: ethers.hexlify(encrypted.handles[0]),
    inputProof: ethers.hexlify(encrypted.inputProof),
  };
}

export async function publicDecryptHandle({ provider, handle }) {
  if (!handle) {
    throw new Error("handle is required");
  }

  const instance = await getBrowserFhevmInstance(provider);
  return instance.publicDecrypt([handle]);
}

export async function userDecryptUint64Handle({
  provider,
  signer,
  contractAddress,
  handle,
  validity = {},
}) {
  if (!provider) {
    throw new Error("provider is required");
  }
  if (!signer) {
    throw new Error("signer is required");
  }
  if (!contractAddress) {
    throw new Error("contractAddress is required");
  }
  if (!handle) {
    throw new Error("handle is required");
  }

  const checksummedContractAddress = ethers.getAddress(contractAddress);
  const checksummedUserAddress = ethers.getAddress(await signer.getAddress());
  const instance = await getBrowserFhevmInstance(provider);
  const keypair = instance.generateKeypair();
  const startTimestamp =
    validity.startTimestamp ?? Math.floor(Date.now() / 1000);
  const durationDays = validity.durationDays ?? 7;
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [checksummedContractAddress],
    startTimestamp,
    durationDays
  );
  const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
  );
  const decrypted = await instance.userDecrypt(
    [{ handle, contractAddress: checksummedContractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature,
    [checksummedContractAddress],
    checksummedUserAddress,
    startTimestamp,
    durationDays
  );

  const clearValue = decrypted?.[handle];
  if (clearValue === undefined || clearValue === null) {
    throw new Error("Failed to decrypt confidential uint64 handle.");
  }

  return BigInt(clearValue);
}
