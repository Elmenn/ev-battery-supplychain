# Dual Marketplace Profile Comparison Note

## Goal

This note captures the next design direction discussed after the current ERC-7984 spike milestone.

The idea is to support two marketplace product profiles:

1. a public-price product profile
2. a private-price product profile

Each profile would use the proof style that best matches its privacy boundary:

- public price profile -> Fiat-Shamir proofs
- private price profile -> Bulletproof-based proofs

## Why this idea exists

The current spike already showed two things:

- for the current implemented marketplace statements, the Fiat-Shamir path is lighter than the Bulletproof path
- public `unitPrice` makes the audit and proof story much simpler

That naturally suggests a broader architectural comparison:

- if price is public, use the simpler proof path
- if price must remain hidden, use the more general proof path

So the next question is no longer only:

- which proof system is faster?

It becomes:

- which privacy profile is the better marketplace design?

## Proposed two-profile model

### Profile A: Public-price marketplace

Public by design:

- `unitPrice`
- product metadata
- stakeholder identities already visible in the current flow

Hidden:

- `quantity`
- `total`
- `paid amount`

Main proof statements:

- `total = unitPrice * quantity`
- `payment = total`

Natural proof choice:

- Fiat-Shamir-transformed sigma proofs

Why this profile is attractive:

- simpler proof statements
- smaller proofs
- faster generation and verification
- easier auditor explanation
- easier alignment with the current implemented ERC-7984 path

### Profile B: Private-price marketplace

Hidden:

- `unitPrice`
- `quantity`
- `total`
- `paid amount`

Public:

- only the minimum listing/product metadata needed to operate the marketplace

Main proof goal:

- preserve the same economic consistency guarantees without exposing price publicly

Natural proof choice:

- Bulletproof-based proofs

Why this profile is attractive:

- stronger business confidentiality
- protects negotiated or sensitive pricing
- allows a more privacy-maximal marketplace configuration

## Important interpretation

This would be a useful comparison, but it is **not** a pure apples-to-apples proof-system benchmark.

If we compare:

- public-price + Fiat-Shamir
- private-price + Bulletproof

then we are changing two things at once:

1. the proof family
2. the marketplace privacy model

So this should be presented as:

- an architectural comparison between two marketplace privacy profiles

not as:

- a universal cryptographic proof-system ranking

## What should not be done

The clean model is **not**:

- create two escrow contracts at the same time for every single product instance

That would complicate:

- product creation
- routing
- UI
- evaluation
- state recovery

Instead, the cleaner design is:

- one shared factory
- two product modes or two escrow templates
- the seller chooses one mode when creating a product

## Recommended contract shape

The cleanest next version would likely be:

- `PublicPriceEscrow`
- `PrivatePriceEscrow`

or equivalent mode-specific initializers/templates under the same factory family.

The creation flow would include a profile choice such as:

- `priceVisibility = public`
- `priceVisibility = private`

The factory would then deploy the correct product type.

## What would be compared

If we implement both profiles, the comparison should include:

### Protocol / privacy comparison

- what is public in each profile
- what remains hidden in each profile
- auditability tradeoffs
- business confidentiality tradeoffs

### Proof comparison

- proof generation time
- proof size
- proof verification time

### Smart-contract / system comparison

- transaction count
- gas cost
- verification workflow complexity
- frontend/operator complexity
- auditor complexity

## Why this is a strong next step

This comparison would let the project say something more meaningful than:

- Fiat-Shamir is faster than Bulletproof in one narrow benchmark

It would instead support a stronger design-space conclusion:

- public-price marketplaces can use a lighter and more auditable proof path
- private-price marketplaces preserve stronger confidentiality at the cost of higher proof and protocol complexity

That is a more defensible and more useful architectural result.

## Recommended next implementation order

1. define the exact privacy boundary for the private-price profile
2. decide whether the private-price profile hides only `unitPrice` or also more listing-level economic metadata
3. design the second escrow/profile variant
4. map the proof statements required for that variant
5. implement one minimal private-price slice first
6. only then run the profile-to-profile comparison

## Current recommendation

This idea makes sense and is worth pursuing.

The main caution is simply how to frame it correctly:

- treat it as a comparison of two marketplace privacy profiles
- not as a pure proof-system benchmark

That framing should stay explicit in both the implementation and the later evaluation.
