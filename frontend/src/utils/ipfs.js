// client/src/utils/ipfs.js
// works with create-react-app / react-scripts

// your Pinata JWT must live in client/.env as REACT_APP_PINATA_JWT
const JWT = process.env.REACT_APP_PINATA_JWT
if (!JWT) {
  throw new Error(
    "REACT_APP_PINATA_JWT is missing. Add it to client/.env and restart `npm start`."
  )
}

/**
 * Upload arbitrary JSON to Pinata and return the IPFS CID.
 * @param {object} obj – a plain JS object
 * @returns {Promise<string>} the new IPFS CID
 */
export async function uploadJson(obj) {
  // stringify and wrap your object
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" })
  const form = new FormData()
  form.append("file", blob, "vc.json")

  const res = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${JWT}`,
      },
      body: form,
    }
  )

  if (!res.ok) {
    // try to extract JSON error, else fallback to status text
    let errMsg = res.statusText
    try {
      const errJson = await res.json()
      errMsg = errJson.error?.details || JSON.stringify(errJson)
    } catch {}
    throw new Error(`Pinata upload failed: ${errMsg}`)
  }

  const { IpfsHash } = await res.json()
  return IpfsHash
}
