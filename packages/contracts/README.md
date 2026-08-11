# Contracts

DevStride currently defines backend contracts with Pydantic schemas under
`apps/api/app/<feature>/schemas.py` and matching handwritten TypeScript types
under `apps/web/src/features/<feature>/types.ts`.

This package does not yet generate or publish shared contracts. Do not add a
third manually maintained contract layer here. The current duplication creates
a documented drift risk; choose and record a contract-generation strategy
before placing artifacts in this package.

See [`docs/api/`](../../docs/api/README.md) for the human-readable current API
contract.
