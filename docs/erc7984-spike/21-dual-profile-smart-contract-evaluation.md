# Dual-Profile Smart-Contract Evaluation

This note is the new smart-contract and runtime comparison for the dual-profile ERC-7984 marketplace.

Current status note (`2026-04-24`):

- this file remains the April-14 runtime baseline comparison set
- active deployment addresses and verification status are tracked in:
  - [11-smart-contract-function-map-and-transaction-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\11-smart-contract-function-map-and-transaction-note.md)
- latest proof-runtime freeze is tracked in:
  - [22-dual-profile-proof-and-vrc-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\22-dual-profile-proof-and-vrc-evaluation.md)

It supersedes the earlier single-profile interpretation in [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md) for final profile-to-profile evaluation, while keeping `13` as the original baseline record.

## Scope

Compared profiles:

- `public-price + Fiat-Shamir`
- `private-price + Bulletproof`

Measured environment:

- Sepolia
- same April 13 dual-profile deployment family
- real Sepolia WETH as the public funding asset
- same ERC-7984 confidential settlement token and wrapper family

This note covers only:

- on-chain transaction count
- gas used
- fee paid
- confirmation latency
- runtime-flow totals

It does not cover:

- proof generation time
- proof size
- proof verification time
- VRC verification latency

Those belong in the later dual-profile proof/VRC evaluation note.

## Why re-evaluation is needed

The earlier smart-contract evaluation in [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md) measured the earlier public-price-centered marketplace path.

That earlier note is still useful as historical baseline evidence, but it is not enough for the current dual-profile architecture because:

- the deployment has changed
- the factory now supports two profile paths
- the final comparison target is now profile-to-profile

So this note should provide the current final on-chain comparison for:

- `public-price`
- `private-price`

## Transaction-set definition

The minimum comparable core flow for both profiles is:

1. create product
2. buyer confidential purchase
3. seller confidential bond
4. seller equality finalization
5. seller confirm order

Setup-only steps (excluded from core profile comparison):

- buyer private deposit (funding wrapper)
- seller private deposit (funding wrapper)

Optional extended slice:

6. transporter bid
7. seller select transporter
8. seller delivery-fee deposit
9. transporter private deposit
10. transporter bond
11. transporter equality finalization
12. confirm delivery

## Measurement template

First captured run:

- profile: `public-price`
- VC CID: `QmSzh1jRYsEx9pvNyYoTyN8RcvaEwy76xRMjySxtmgfh9s`
- order ID: `0xa592aeae0acbf8748442c1352660aae7fad95de8f5989af89eb4404c05316cff`
- product: `0xf5b6aa0dfcbf9632abecd15305ce7df623a12fc5`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

Second captured run:

- profile: `private-price`
- VC CID: `QmaDMn58Zj9jxsUXvo7xENS6hzE4zgheFAstVsTx5s8pCd`
- order ID: `0x3d11b2d141a60810c6271d9603eebcc0f2434cb2f12e59b04335066c6db3cb3d`
- product: `0xc420b2fb3b35da75171534e651da33ca680a2b34`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

Additional captured runs (stability round 2):

- profile: `public-price`
- VC CID: `QmaT4FTL6ufPWXgu7tQ772ro6RHbMuda9V2mpQ5F6ETcD7`
- order ID: `0xa8bfce0be3a0114fccc8b36d49d3dc3fdbf88dc37eb85cbed1cdeeabf6c7269b`
- product: `0xcc5ce8213b784afb3b4d9c9e213f2c3bc434e34a`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

- profile: `private-price`
- VC CID: `QmaYeHgr7zrfrgUM6CgA4DSb7tngsQCQBnhzPh4wVFsn7Q`
- order ID: `0x602d4b94d47d124cb1ce2e3a91e1a0e23f709dd7bba5429d5aa1770ef1d99c50`
- product: `0x24406af3475b5ac3b6b0e590529952b92310f4f5`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

Additional captured runs (stability round 3):

- profile: `public-price`
- VC CID: `QmPBZp6H6iHAzcF1Jw1wJXiDwNP7LopbE8mserbZxnoeEd`
- order ID: `0xaaaa489d6165c05eec09e5f69c185298e29c5c4461c0c6a45306fb3b9e3382fe`
- product: `0x6c9a6e945ec23f1fbc87c6ffcd81f01e7245a95c`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

- profile: `private-price`
- VC CID: `QmR2vJCs3aSq7p5px64ozYYLHJVPqQ8Toh5Lk3UBsAyCzn`
- order ID: `0xcd4810249b6016f8c24ac22d3bf527c792dc47a0cec8f0fdf24fedf4cccc8f34`
- product: `0x7f1da0eecbeed8c1b455fdee47b988aaadc5686c`
- extraction date: `2026-04-14`
- extraction method: `scripts/erc7984/extract-dual-profile-evaluation.js`

### A. Public-price profile

| Transaction | Tx hash | Gas used | Fee paid | Confirmation latency | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| create product | `0xccc15eeff243011378569709beb457c3962606f47d1178f9cf9024c1d9d70d4d` | `361,909` | `0.000546716510244059 ETH` | `n/a` | from factory event |
| buyer private deposit | not observed | n/a | n/a | `n/a` | buyer appears pre-funded for this order |
| buyer confidential purchase | `0xfb363fb14b7e03c8345196c4de796e68847f6d5fd6cd665e0ff4522083496996` | `984,150` | `0.0014877810192078 ETH` | `n/a` | from escrow event |
| seller private deposit | `0xf12f090d45aa7b0ba3b0f0467700de36ba9844640ec3862527ed933a1f15612b` | `314,424` | `0.000475275511566504 ETH` | `n/a` | inferred wrapper event (high confidence) |
| seller confidential bond | `0x84c6f2963527e89d90e48a6dd59480044877c25d6ffb530f8d3fdddd1e6114f8` | `917,016` | `0.001386383498796408 ETH` | `n/a` | from escrow event |
| seller equality finalization | `0x1523d9b12c12461e37c019c025000670e13b1378c9c3e21649a7cb9fc3920866` | `345,056` | `0.000521582113493824 ETH` | `n/a` | from escrow event |
| seller confirm order | `0x7cbcd806eabb4c41d2061082c8fd251a6ec1406bb7d8723ef022b694069b609e` | `103,243` | `0.000156128058761941 ETH` | `n/a` | from escrow event |

### B. Private-price profile

| Transaction | Tx hash | Gas used | Fee paid | Confirmation latency | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| create product | `0x443b76686f3b59a685ee65ce881429a6460f054503e9840e4e4c983834cbeb2e` | `368,602` | `0.00055516262793953 ETH` | `n/a` | from factory event |
| buyer private deposit | not observed | n/a | n/a | `n/a` | buyer appears pre-funded for this order |
| buyer confidential purchase | `0x6f4a15169dc65cf4e8cdd6d492c6fd536e742284d26788a6e105371e345cb059` | `984,128` | `0.001483328380572928 ETH` | `n/a` | from escrow event |
| seller private deposit | `0x74bcc2136a7699f43d8f337f2892bf162e7e04275c3f1f28a0fa126f00846429` | `314,412` | `0.000473863773230064 ETH` | `n/a` | inferred wrapper event (high confidence) |
| seller confidential bond | `0xe2e055a8bc92624aa5cd952984eef6b06e3918df166e49859673a8bc4b4de303` | `916,994` | `0.00138216600564965 ETH` | `n/a` | from escrow event |
| seller equality finalization | `0xdcd9d0ae10ba3d6adafa6389d6f432cd3de98a64700793fa6ac70c7df7555795` | `345,008` | `0.000520090435228416 ETH` | `n/a` | from escrow event |
| seller confirm order | `0xf8ab1eb242396f3d67e3a1c9d58988066f1e3b24d2df20d29d3ace75f45df8bb` | `103,243` | `0.000155620190442276 ETH` | `n/a` | from escrow event |

## Runtime totals

### Public-price totals

| Slice | Total fee | Total latency | Notes |
| --- | ---: | ---: | --- |
| Buyer-side slice | `0.0014877810192078 ETH` | `n/a` | excludes buyer private deposit (not observed for this order) |
| Seller-side slice | `0.002539369182618677 ETH` | `n/a` | includes seller private deposit, bond, equality finalize, confirm |
| Full measured runtime total | `0.004573866712070536 ETH` | `n/a` | includes create product and observed order-flow txs |

### Private-price totals

| Slice | Total fee | Total latency | Notes |
| --- | ---: | ---: | --- |
| Buyer-side slice | `0.001483328380572928 ETH` | `n/a` | excludes buyer private deposit (not observed for this order) |
| Seller-side slice | `0.002531740404550406 ETH` | `n/a` | includes seller private deposit, bond, equality finalize, confirm |
| Full measured runtime total | `0.004570231413062864 ETH` | `n/a` | includes create product and observed order-flow txs |

## Direct profile comparison

| Comparison | Public-price | Private-price | Relative difference |
| --- | ---: | ---: | ---: |
| Create product gas | `361,909` | `368,602` | private `+6,693` gas (`+1.85%`) |
| Buyer confidential purchase gas | `984,150` | `984,128` | private `-22` gas (`-0.00%`) |
| Seller confidential bond gas | `917,016` | `916,994` | private `-22` gas (`-0.00%`) |
| Seller equality finalization gas | `345,056` | `345,008` | private `-48` gas (`-0.01%`) |
| Buyer-side total fee | `0.0014877810192078 ETH` | `0.001483328380572928 ETH` | private `-0.000004452638634872 ETH` (`-0.30%`) |
| Seller-side total fee | `0.002539369182618677 ETH` | `0.002531740404550406 ETH` | private `-0.000007628778068271 ETH` (`-0.30%`) |
| End-to-end total fee | `0.004573866712070536 ETH` | `0.004570231413062864 ETH` | private `-0.000003635299007672 ETH` (`-0.08%`) |
| Seller-side elapsed block time (bond -> confirm) | `84 s` | `60 s` | private `-24 s` (`-28.57%`) |
| Core order elapsed block time (purchase -> confirm) | `216 s` | `204 s` | private `-12 s` (`-5.56%`) |
| Full measured flow elapsed block time (create -> confirm) | `300 s` | `312 s` | private `+12 s` (`+4.00%`) |

## Final stability view (n=3 per profile)

The table below compares profile means across three captured runs per profile.

| Comparison (mean over 3 runs) | Public-price mean | Private-price mean | Relative difference |
| --- | ---: | ---: | ---: |
| Create product gas | `361,829` | `368,610` | private `+6,781` gas (`+1.87%`) |
| Buyer confidential purchase gas | `984,150` | `984,128` | private `-22` gas (`-0.00%`) |
| Seller confidential bond gas | `917,008` | `916,994` | private `-14` gas (`-0.00%`) |
| Seller equality finalization gas | `345,032` | `345,012` | private `-20` gas (`-0.01%`) |
| Seller confirm order gas | `103,243` | `103,243` | no difference |
| Buyer-side total fee | `0.001590147041598 ETH` | `0.001555578453926059 ETH` | private `-0.000034568587671941 ETH` (`-2.17%`) |
| Seller-side total fee | `0.002538926642273143 ETH` | `0.002494010916815645 ETH` | private `-0.000044915725457498 ETH` (`-1.77%`) |
| End-to-end total fee | `0.004716569913261258 ETH` | `0.004635219842333694 ETH` | private `-0.000081350070927564 ETH` (`-1.72%`) |
| Seller-side elapsed block time (bond -> confirm) | `80 s` | `68 s` | private `-12 s` (`-15.00%`) |
| Core order elapsed block time (purchase -> confirm) | `200 s` | `244 s` | private `+44 s` (`+22.00%`) |
| Full measured flow elapsed block time (create -> confirm) | `304 s` | `372 s` | private `+68 s` (`+22.37%`) |

Min/mean/max across the 3 runs:

| Metric | Public-price min / mean / max | Private-price min / mean / max |
| --- | ---: | ---: |
| End-to-end total fee | `0.004381301036249747 / 0.004716569913261258 / 0.005194541991463492 ETH` | `0.00432475617906471 / 0.004635219842333694 / 0.005010671934873509 ETH` |
| Seller-side elapsed block time (bond -> confirm) | `72 / 80 / 84 s` | `60 / 68 / 72 s` |
| Core order elapsed block time (purchase -> confirm) | `144 / 200 / 240 s` | `144 / 244 / 384 s` |
| Full measured flow elapsed block time (create -> confirm) | `276 / 304 / 336 s` | `252 / 372 / 552 s` |

Interpretation note:

- gas is the more stable profile comparison metric
- fee differences mostly reflect gas-price variance across blocks and times
- elapsed block-time differences mostly reflect transaction submission timing and block conditions, not contract logic differences

## Avg transaction-latency view (current dataset)

Average timings below are measured from on-chain block timestamps between consecutive core events (`n=3` per profile).

| Latency metric (avg) | Public-price | Private-price |
| --- | ---: | ---: |
| create -> purchase | `104 s` | `128 s` |
| purchase -> seller bond | `120 s` | `176 s` |
| seller bond -> equality finalize | `36 s` | `24 s` |
| equality finalize -> confirm order | `44 s` | `44 s` |

Latency-note:

- these are reliable inter-step chain timings
- they are not wallet-submit to confirmation timings
- true per-transaction confirmation latency needs client submit timestamps (future instrumentation)

## Core flow vs ERC20 (WETH baseline)

Baseline source: [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md)

- WETH `transfer(...)` avg gas: `34,470`
- WETH `transfer(...)` avg fee: `0.000133628 ETH`
- WETH `transfer(...)` avg confirmation latency: `11,437 ms`

Core-step comparison against that plain-token baseline:

| Core transaction | Public profile mean | Private profile mean | vs WETH transfer (gas) |
| --- | ---: | ---: | ---: |
| buyer confidential purchase (gas) | `984,150` | `984,128` | `~28.5x` |
| seller confidential bond (gas) | `917,008` | `916,994` | `~26.6x` |
| seller equality finalization (gas) | `345,032` | `345,012` | `~10.0x` |
| seller confirm order (gas) | `103,243` | `103,243` | `~3.0x` |

| Core transaction | Public profile mean fee | Private profile mean fee | vs WETH transfer (fee) |
| --- | ---: | ---: | ---: |
| buyer confidential purchase (fee) | `0.001590147041598 ETH` | `0.001555578453926059 ETH` | `~11.9x` / `~11.6x` |
| seller confidential bond (fee) | `0.00147780300915512 ETH` | `0.001454238042231806 ETH` | `~11.1x` / `~10.9x` |

## Expected interpretation questions

This note should answer:

- does the more private profile cost more on-chain?
- does hidden price materially change the core transaction costs?
- are the dominant gas costs still the confidential settlement callbacks rather than the public listing mode?

## Current status

This file is the measurement template and final destination for the new on-chain comparison.

Current completion:

- public-price core flow: 3 measured runs captured
- private-price core flow: 3 measured runs captured
- final n=3 mean and min/mean/max summary added
- compact `vs ERC20/WETH` baseline section added
- average latency section added (inter-step chain timings)
