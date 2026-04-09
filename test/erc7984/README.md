# ERC-7984 Spike Tests

Planned first tests:
- buyer can confidential-transfer into escrow with callback
- escrow stores order metadata and encrypted amount handle
- callback rejects duplicate `orderId`
- seller release transfers confidential amount out of escrow
- non-supported token callback reverts

The spike is intentionally isolated from the working Railgun tests.
