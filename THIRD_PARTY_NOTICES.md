# Third-Party Notices

OjoLink includes data from the sources below. Each is listed with where it lives in this repository, its license, and the notice that license requires.

## Unicode confusables data

- **What:** `confusables.txt` from Unicode Security Mechanisms (UTS #39).
- **Where:** pinned, unmodified, at `tools/build-data/sources/unicode/confusables.txt`. A filtered form is generated into `packages/core/src/data/confusables.ts`, which states the Unicode version it came from.
- **Source:** https://www.unicode.org/Public/security/
- **License:** Unicode License v3. The full text, including the copyright and permission notice, is at `tools/build-data/sources/unicode/LICENSE.txt`.

## Public Suffix List

- **What:** the Public Suffix List maintained by Mozilla, used to find the registrable domain of a host.
- **Where:** not stored in this repository. It is embedded in the `tldts` dependency (MIT License) and becomes part of the built engine.
- **Source:** https://publicsuffix.org/
- **License:** Mozilla Public License 2.0.

> This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

## Majestic Million

- **What:** the Majestic Million ranking of domains, used to confirm that the domains in the global pack of protected brands are the brands' real ones.
- **Where:** not stored in this repository. `pnpm --filter @ojolink/build-data refresh:ranking` downloads it, and the rank of each listed domain is recorded in `tools/build-data/sources/protected/global.json`.
- **Source:** https://majestic.com/reports/majestic-million
- **License:** Creative Commons Attribution 3.0 Unported, https://creativecommons.org/licenses/by/3.0/

> Majestic Million CSV by Majestic 12 is licensed under a Creative Commons Attribution 3.0 Unported License.

## Curated lists

The protected-domain packs (`tools/build-data/sources/protected/`) and the shortener list (`tools/build-data/sources/shorteners.json`) are compiled by this project. Each protected entry records the source used to confirm it.
