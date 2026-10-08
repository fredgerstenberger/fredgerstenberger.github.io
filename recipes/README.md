# Recipe Box is at app.bakfan.com

Recipe Box lives at **https://app.bakfan.com** (code: the private repo `fredgerstenberger/fredgerstenberger-recipe-box`).

This folder is only the old address's redirect: `index.html` and `redirect.js` send everyone to app.bakfan.com,
keeping a link's `?query` and `#fragment` (so shortcuts like `?add=milk` still work). `sw.js` has a new version, so a
copy of the old app installed on a Home Screen updates to the redirect and clears the old app's cached files.

Tests: `npm test` in this folder.
