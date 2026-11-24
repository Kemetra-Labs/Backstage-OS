# Self-hosted fonts (V2 lab only)

Vendored files, not an npm dependency: `package.json` and `package-lock.json` are unchanged. The files are served from the
lab's own origin by Vite (hashed into `dist-v2/assets/`), so the browser makes no third-party font request.

| File | Family | Source package | Integrity of the package tarball | SHA-256 of the file | Licence |
| --- | --- | --- | --- | --- | --- |
| `manrope-latin-wght-normal.woff2` | Manrope, variable weight 200 to 800, Latin subset | `@fontsource-variable/manrope@5.3.0` (`files/`) | `sha512-6D5dgokHsWDDMtmXHznKa0hK229NN+1a4BLPmUCLqcO1Pw5EEhWY5RFt0AcXnVRAljFFPfRtLkJePQj6LSsV6g==` | `a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972` | SIL OFL 1.1, `OFL-Manrope.txt` |
| `cairo-arabic-wght-normal.woff2` | Cairo, variable weight 200 to 1000, Arabic subset | `@fontsource-variable/cairo@5.3.0` (`files/`) | `sha512-zkxIsVQ406AJXD1qaldeOj+CIsMzRMXRT2x6fkYjNJE2DFsqGMzNGFhdrZdZagq3qX9JwaMaZetMc7/oUlpfpg==` | `748022f50c427456ad66031e855349be3448ee1f05a5f1eb59574ebe0c686749` | SIL OFL 1.1, `OFL-Cairo.txt` |

The files are unmodified. The OFL allows bundling and redistributing the fonts with software, including self-hosting on
the web, provided the licence travels with them (it does, in the two `OFL-*.txt` files) and the fonts are not sold on
their own. Neither family uses a Reserved Font Name that a renamed copy would need to avoid, and no copy is renamed here.

Why these two: Manrope is a geometric sans with tabular figures (`tnum`), the narrower and lighter of the two candidates
the ticket names (Sora's Latin file is 33.6 KB and wider). Cairo is the Arabic face both V1 and V2 already name in their
stacks. Only Cairo's Arabic subset ships; Latin text inside Arabic pages (ids, digits) falls through to Manrope, which
saves the 33.8 KB Cairo Latin file and keeps tabular figures in both languages.

`styles/embed-fonts.css` declares both faces (as "Kawalys BC Manrope" and "Kawalys BC Cairo"; the lab's own `styles/fonts.css` retired with the lab entry, BACK-92 R4) with `src: url(...)` only (no `local()`, so an installed copy never wins) and
keeps the fontsource `unicode-range`, so an English page downloads Manrope only and Cairo is fetched only when Arabic
text is on screen.
