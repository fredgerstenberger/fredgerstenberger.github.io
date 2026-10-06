# Recipe Box has moved

Recipe Box now lives at **https://app.bakfan.com** (code: the private repo `fredgerstenberger/recipe-box`).

This folder is only the old address's hand-off page, so nobody loses anything:

- **Move my data** packs everything the app kept on this phone (recipes, plans, lists, settings, the sync box),
  encrypts it on the phone (`move-crypto.js`, an exact copy of the one in the app's repo), uploads only the encrypted
  bytes to the Worker for 24 hours, and opens `app.bakfan.com/#move=<id>.<key>`. The key is in the `#fragment`, which
  no server sees. On an iPhone Home Screen install it hands over the link to paste in the new app instead, because a
  Home Screen app opens other addresses in Safari, which keeps separate data.
- After that, this address shows **Moved to app.bakfan.com**. The old data stays here as a fallback, with
  **Download a backup file**.
- Shortcut and share links (`?add=`, `?url=`, `?invite=`) are forwarded to the new address.

Tests: `npm test` in this folder. Remove this folder once every phone has moved (see the app repo's `docs/DEPLOY.md`).
