// File: src/components/StageCard.jsx
import React, { useState } from 'react'
import VerificationBox from '../vc/VerifyVCTab-Enhanced'
import VCViewer from '../vc/VCViewer'
import ZKPVerificationBox from '../vc/ZKPVerificationBox'

// Utility to truncate long DIDs
const truncate = (str, front = 12, back = 6) =>
  str.length <= front + back
    ? str
    : `${str.slice(0, front)}…${str.slice(str.length - back)}`

export default function StageCard({
  stageIndex,
  vc,
  cid,
  onVerifyVC,
  onVerifyZKP,
}) {
  const [showVC, setShowVC] = useState(false)
  const [vcResult, setVcResult] = useState(null)
  const [zkpResult, setZkpResult] = useState(null)
  const [loadingVC, setLoadingVC] = useState(false)
  const [loadingZKP, setLoadingZKP] = useState(false)
  const [vcError, setVcError] = useState(null)

  const handleVerifyVC = async () => {
    setLoadingVC(true)
    setVcError(null)
    try {
      const res = await onVerifyVC(vc, cid)
      setVcResult({
        issuer: { ...res.issuer, did: truncate(res.issuer.did) },
        holder: { ...res.holder, did: truncate(res.holder.did) },
      })
    } catch (err) {
      setVcError(err.message || 'Verification failed')
    } finally {
      setLoadingVC(false)
    }
  }

  const handleVerifyZKP = async () => {
    setLoadingZKP(true)
    try {
      const res = await onVerifyZKP(vc, cid)
      setZkpResult(res)
    } finally {
      setLoadingZKP(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-xl font-semibold mb-2 sm:mb-0">
          Stage {stageIndex}
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={handleVerifyVC}
            disabled={loadingVC}
            className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >
            {loadingVC && (
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy=">12"
                  r=">10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            )}
            Verify VC
          </button>

          <button
            onClick={handleVerifyZKP}
            disabled={loadingZKP}
            className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >
            {loadingZKP && (
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy=">12"
                  r=">10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            )}
            Verify ZKP
          </button>

          <button
            onClick={() => setShowVC(v => !v)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded"
          >
            {showVC ? 'Hide VC' : 'View VC'}
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Left: Verification Results */}
        <div>
          {vcError && <div className="text-sm text-red-600 mb-2">⚠️ {vcError}</div>}
          {vcResult?.issuer && (
            <VerificationBox
              title="Issuer Verification"
              result={vcResult.issuer}
              did={vcResult.issuer.did}
            />
          )}
          {vcResult?.holder && (
            <VerificationBox
              title="Holder Verification"
              result={vcResult.holder}
              did={vcResult.holder.did}
            />
          )}
        </div>

        {/* Right: VC Details */}
        <div className="overflow-auto">
          {showVC && <VCViewer vc={vc} />}
        </div>
      </div>

      {/* ZKP Result */}
      {zkpResult && (
        <div className="mt-6 border-t pt-4">
          <ZKPVerificationBox proof={zkpResult} />
        </div>
      )}
    </div>
  )
}
