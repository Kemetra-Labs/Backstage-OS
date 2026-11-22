# Third-party provenance

Code in this directory that originates elsewhere is listed here.

| Retail Tower path | Donor SHA | Kawalys path | Change |
| --- | --- | --- | --- |
| `services/backend-core/packages/shared/src/errors/envelope.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/src/errors/envelope.ts` | None below a 3-line provenance header |
| `services/backend-core/packages/shared/__tests__/errors/envelope.spec.ts` | `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` | `server/test/errors/envelope.spec.ts` | None below a 3-line provenance header (the import path already resolved, so it is unchanged) |

Source repository: Kemetra-Labs/Retail-Tower-Erp.

## Licence

Apache-2.0, Copyright 2026 Kemetra-Labs. See the donor files at the pinned SHA:

- [LICENSE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/LICENSE)
- [services/backend-core/NOTICE](https://github.com/Kemetra-Labs/Retail-Tower-Erp/blob/dea1adc386ad6e8129e7342c873c74ea6f9e5b0c/services/backend-core/NOTICE)

This repository now has its own Apache-2.0 `LICENSE` at the root; the root `NOTICE` points here.

## Independence

No runtime dependency on `@data-pulse-2/*`, no shared credentials, Retail Tower unchanged.

## Rollback

Delete `server/src/errors/envelope.ts` and its test (`server/test/errors/envelope.spec.ts`).
