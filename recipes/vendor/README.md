# Vendored libraries

Pinned copies of the two observability SDKs, served from the app's own origin so the app never loads code
from a third-party CDN, works the same offline and inside a future native wrapper. They load in the
background after the first screen is drawn (see `js/monitor.js` and `js/analytics.js`); the app works the
same if either file fails to load.

| File | Package | How it was made |
|---|---|---|
| `sentry.min.js` | `@sentry/browser` 11.4.0 | `esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --target=es2020`, where `entry.js` is `export { init, captureException, captureMessage, setUser, setTag, setContext, addBreadcrumb, close, getClient } from "@sentry/browser";` (errors only: no tracing or replay code) |
| `posthog.min.js` | `posthog-js` 1.436.1 | `dist/module.slim.no-external.js` copied as is (minus its source map comment): events only, and it never downloads extra scripts |

To update: change the version, rebuild the same way, and test both in a browser. Licenses: `LICENSES.txt` (both MIT).
