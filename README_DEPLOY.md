
# Deploy checklist — make assets/app.js available to GitHub Pages

Follow these steps in your repo root. Commands assume you use `origin` and branch `main`. Adjust if your Pages uses `gh-pages` or `docs/`.

1) Quick automated check
- Make script executable and run check:
  chmod +x scripts/check_app_deploy.sh
  ./scripts/check_app_deploy.sh

- Interpret output:
  - If `[LOCAL] ./assets/app.js -> missing` → your file is not present locally. Add/create it at `assets/app.js`.
  - If `assets/app.js NOT present on origin/main` → file is not pushed to remote branch; push it.
  - If HTTP status for `https://<user>.github.io/<repo>/assets/app.js` is 200 → Pages serves file (good).
  - If 404 → Pages is not finding the asset (see next steps).

2) If assets/app.js is present locally but not on origin/main
- Add, commit and push:
  git add assets/app.js
  git commit -m "Add assets/app.js"
  git push origin main

3) If GitHub Pages is configured to serve from `docs/` (check in repo Settings → Pages)
- Run the helper to copy assets into docs/ and push:
  chmod +x scripts/deploy_assets_to_docs.sh
  ./scripts/deploy_assets_to_docs.sh
  (This copies `assets/app.js` → `docs/assets/app.js`, commits and pushes.)

4) If Pages uses `gh-pages` branch
- Push assets to that branch:
  git checkout -b gh-pages origin/gh-pages || git checkout gh-pages
  mkdir -p assets
  cp assets/app.js assets/app.js
  git add assets/app.js
  git commit -m "Add app assets for Pages"
  git push origin gh-pages

5) Verify the published URL (after ~1 minute):
- curl -I https://wdvdje.github.io/willlappschedule/assets/app.js
  - Expect HTTP 200 and `content-type: text/javascript`

6) Once the asset is served successfully
- Remove the inline loader fallback from your HTML files and use:
  <script src="./assets/app.js"></script>

7) If still failing, collect diagnostics and paste here:
- Output of `./scripts/check_app_deploy.sh`
- Result of `curl -I https://wdvdje.github.io/willlappschedule/assets/app.js`
- The Pages configuration (branch/folder) from repository Settings → Pages

Notes and common pitfalls
- File path and filename are case-sensitive. Ensure `assets/app.js` exactly matches (not App.js or assets/App.js).
- If you build the site (e.g., a static site generator), ensure the build output includes `assets/app.js`.
- After pushing, wait ~60s for Pages to update; sometimes it takes a couple minutes.

If you want, I can:
- Produce a minimal `assets/app.js` bootstrap you can commit immediately to confirm Pages serves it.
- Or walk you through running the check scripts and interpreting their output — paste the output here and I’ll tell the exact next command.
