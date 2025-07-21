// client/src/components/ProductList/ProductList.js
import { formatEther } from "ethers";

export default function ProductList({
  products = [],
  web3,
  showButton = false,
  handleBuyProduct,
  handleShowDistributors,
  handleConfirmDelivery,
  customAction,
}) {
  if (!products || products.length === 0) {
    return <p>No products available</p>;
  }

  // format wei → ether, using web3 if present, otherwise ethers.formatEther
  const fmt = (wei) =>
    web3?.utils
      ? web3.utils.fromWei(wei.toString(), "ether")
      : formatEther(wei);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <div key={p.address} className="border rounded-lg shadow p-4 space-y-2">
          <h3 className="font-semibold">{p.name}</h3>
          <p>Price: {fmt(p.price)} ETH</p>
          <p>
            Owner:{" "}
            {p.owner.length > 10
              ? `${p.owner.slice(0, 6)}…${p.owner.slice(-4)}`
              : p.owner}
          </p>
          <p>Purchased: {p.purchased ? "Yes" : "No"}</p>

          {p.vcCid && (
            <a
              className="block text-sm text-blue-600 underline break-all"
              href={`https://ipfs.io/ipfs/${p.vcCid}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View VC (CID {p.vcCid.slice(0, 8)}…)
            </a>
          )}

          {showButton && handleBuyProduct && (
            <button
              className="bg-blue-600 text-white py-1 px-3 rounded"
              onClick={() => handleBuyProduct(p.address, p.price)}
            >
              Buy
            </button>
          )}

          {handleShowDistributors && (
            <button
              className="bg-gray-200 py-1 px-3 rounded"
              onClick={() => handleShowDistributors(p)}
            >
              Info
            </button>
          )}

          {handleConfirmDelivery && p.purchased && (
            <button
              className="bg-green-600 text-white py-1 px-3 rounded"
              onClick={() => handleConfirmDelivery(p.address)}
            >
              Confirm Delivery
            </button>
          )}

          {customAction && customAction(p)}
        </div>
      ))}
    </div>
  );
}
