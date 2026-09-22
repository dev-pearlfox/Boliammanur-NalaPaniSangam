# HEART LOGIC INDEX — function-expenses/

**Applies to:** `index.html`, `members.html`, `style.css`, `app.js`, `members.js`, `shared.js`

Do not change any of the following without asking first (warn **"Warning: Heart
Logic"** and get explicit permission before touching any of it). Each of these
was arrived at after a real, measured problem — reverting to something that
"looks simpler" reintroduces the original bug. Full reasoning for each lives
as a comment at its actual code location; this file is the index.

---

## 1. `.sticky-top-stack` (style.css)
Header + `.members-filter-card` + `.members-thead-wrap` share ONE sticky
container instead of each being independently sticky. Independent sticky +
JS-measured offsets caused a real two-stage stutter (one piece shrank a frame
before its neighbor's position updated).

## 2. `transform:scale()` vs padding/font-size for shrink animations
(header h1, `.members-filter-card` in style.css) — transform is
compositor-only (no forced layout recalc every frame); padding/font-size
transitions do force it, and cost scales with total page size. The table's
own header/filter row is the ONE exception, left on padding/font-size
deliberately — switching it to transform breaks column alignment with
`.members-tbody-wrap`.

## 3. `header h1` uses `transform:scale()`, never font-size (style.css)
Animating font-size on wrapping text causes a discrete (unsmoothable) jump
exactly when it collapses from 2 lines to 1.

## 4. `syncPillsCardCollapse()` measures `card.offsetHeight` directly (members.js)
Not the parent's auto-computed height — a negative margin-bottom on a
width-constrained element doesn't reduce the parent's height correctly
(confirmed on the real page, root cause never fully isolated).

## 5. `.members-thead-wrap` / `.members-tbody-wrap` / `.members-table-card`
carry their own border/radius/shadow directly, no `.card` wrapper (style.css)
— the "no container" spreadsheet look. `overflow:hidden` on both wrappers
(not just `overflow-x`) is what actually rounds the corners, since
border-radius directly on a `<th>`/`<td>` is unreliable under
`border-collapse:collapse`.

## 6. `.sticky-top-inner` uses the exact same max-width:1320px/margin:auto/padding
container `<main>` uses (style.css) — not similar values, the literal same
mechanism, so the pills bar/spreadsheet header structurally can't drift out
of alignment with `.members-table-card`. An earlier version computed width
via `max-width:min(calc(...),1288px)` directly on `.members-thead-wrap` —
verified correct in every automated check across two browser engines, but
intermittently rendered flush-left on a real device, fixed by reload.

## 7. `table.members-table` column widths are literal fixed px
(style.css, already marked HEART LOGIC there) — do not stretch to fill wide
screens. A percentage-based stretch version was built and tested, then
explicitly reverted.

## 8. `table.sheet tbody` odd/even row backgrounds are explicit
`var(--surface)` / `var(--surface-2)` (style.css), not left transparent —
the table sits directly on the page background now (no white card behind
it), so transparent showed the page's own faint cream tint instead of white.

## 9. `.pill-row` (members filter buttons) is `nowrap` + `overflow-x:auto`
(style.css), never wraps to multiple lines — wrapping split the shared
rounded outline unevenly. members.js scrolls the clicked pill to center on
click so neighbors peek on both sides on narrow screens.

## 10. Cache-busting `?v=...` on style.css / shared.js / members.js / app.js
(both `members.html` and `index.html`) — browsers repeatedly served a stale
cached copy after a real deploy until a manual hard refresh, which on
`index.html` once surfaced as a much worse symptom than stale styling: a
stale `app.js` referencing an element id that had been renamed in a
restructure silently threw and aborted before the ledger rows ever rendered,
leaving only the static header row visible with no data — **bump the version
string on every future change to any of these files, on both pages, every
time.**

## 11. CDN scripts use SRI (Subresource Integrity) hashes
The Supabase (and Chart.js on the dashboard) script tags have `integrity="sha384-..."`
attributes. This means if the CDN ever serves modified/malicious code, the
browser refuses to run it. If you EVER bump the pinned version (e.g., Supabase
2.116.0 → 2.117.0), you MUST regenerate the hash:

```bash
curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@NEW_VERSION/dist/umd/supabase.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```

Or use https://www.srihash.org/. Forgetting to update the hash after a version
bump = the page silently fails to load Supabase and nothing works.

## 12. Deployment: two homes
This file has two homes — the `boliammanur-functions` repo (source) and the
`eagleview-site` repo (mirror, actually served at newmantech.in) — every
change needs pushing to BOTH, verified by fetching the live URL directly
afterward, not just trusting the push succeeded.
