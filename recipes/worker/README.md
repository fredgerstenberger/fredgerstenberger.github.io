# Recipe Box proxy (Cloudflare Worker)

Recipe Box runs entirely in your browser, and browsers won't let one website read another website's pages. So to import a recipe, the app needs a middleman to download the page. Out of the box it uses free public proxies, which work but are sometimes slow or down.

This folder has your own private proxy. It runs free on Cloudflare (the free plan allows 100,000 requests a day) and only answers requests from your Recipe Box.

## Setup (about 5 minutes, no coding)

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. In the sidebar, open **Compute (Workers)** → **Workers & Pages**, then **Create** → **Create Worker**. (Cloudflare occasionally renames these menus; look for "Workers".)
3. Name it `recipe-proxy` and click **Deploy**. It deploys a "Hello World" example.
4. Click **Edit code**. Delete everything in the editor, paste in the contents of [`worker.js`](worker.js), and click **Deploy**.
5. Copy your Worker's address. It looks like `https://recipe-proxy.<your-name>.workers.dev`.
6. In Recipe Box, open **Settings → Recipe import**, paste the address and tap **Test**. You should see "Proxy works ✓".

That's it. Imports now try your proxy first and fall back to the public ones.

## Notes

- If you host Recipe Box somewhere other than `https://fredgerstenberger.github.io`, add that address to `ALLOWED_ORIGINS` at the top of `worker.js`.
- Some sites (a few big ones with aggressive bot protection) may still block the download. Use **Enter it by hand** for those.
