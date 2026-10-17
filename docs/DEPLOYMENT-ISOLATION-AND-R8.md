# Artifact deployment and optimized preview acceptance

## Scope

This change does not switch the live Pages source, enable R8 for `release`, bump
the Play version, change Firebase rules, or authorize a Play upload. Those are
separate acceptance gates. A merged PR alone is not proof of deployment isolation.

## Pages migration

The existing Pages source was verified as legacy `main:/` on 2026-10-17. This
publishes repository files even when `dist` excludes them. Only a successful
artifact deployment followed by live negative URL checks closes this issue.

1. Run `npm ci` and `npm run release:check`. The allowlist includes the existing
   CNAME, `.nojekyll`, `.well-known/assetlinks.json`, PWA files and account pages.
   It does not copy the `.well-known` directory as a whole.
2. `node scripts/package-pages.mjs <temporary-directory>/artifact.tar` validates
   the complete file list, rejects unexpected directories/files, symlinks and
   hardlinks, and verifies the final tar members. The stock Pages upload action
   excludes dot directories, so it would silently omit Android association;
   this workflow uploads our checked tar with `actions/upload-artifact` instead.
3. Review local artifact UI (guest query, navigation), service-worker references,
   login configuration, policy/deletion routes and Android association. Do not
   upload private fixtures, source maps, OCR photos or backups to an artifact.
4. After approval/merge, switch repository Pages source to **GitHub Actions**,
   preserving `searchbefore.tw`, then set `PAGES_ARTIFACT_DEPLOY_ENABLED=true` and
   dispatch `pages.yml` on main. The deploy job refuses legacy source mode.
   The workflow cannot deploy a PR/non-main branch and writes no repository code.
5. Verify deployment SHA and HTTP responses: `/`, `/privacy.html`,
   `/delete-account.html`, `/manifest.webmanifest`, `/sw.js`, `/service-config.js`
   and `/.well-known/assetlinks.json` must work. `/dev/ocr-manual-review.html`,
   `/scripts/build-release.mjs`, `/docs/`, `/.git/config` and a random unknown path
   must not return usable content (check network response without a cached SW).
   Confirm DNS/proxy/security headers and login popup still work. A failed login
   not using credentials is not a completed Google OAuth acceptance.
6. Rollback: retain/rebuild the last known-good **allowlisted artifact** from its
   reviewed commit, revert the faulty source change through a PR and redeploy.
   Do not restore root-directory publication as the normal rollback path. If the
   deployment gate is disabled, the last successful artifact remains served;
   disabling it does not by itself remove already published root files.

The source repository remains public. Website isolation is not a confidentiality
mechanism for information committed to that public repository.

## Android optimization gates

- `optimizedPreview` is minified, resource-shrunk and **not debuggable**, signed
  with Android Debug, with package suffix `.nativepreview` and a NOT-FOR-PLAY
  version label. Never install it over `tw.searchbefore.app`.
- Dynamic Firebase resource names are explicitly retained. Check the APK with
  `node scripts/verify-native-optimized.cjs` (`ANDROID_HOME` required), not only
  generated XML. `--fixture` additionally verifies the offline CI project marker.
- Run `VerifyNativeManifest.java optimizedPreview` on the generated merged
  manifest. It uses the preview package identity but the strict non-debuggable
  component, permission, backup and cleartext policy; debug tooling is rejected.
- CI builds with `-PnativeOptimizationFixture=true`; the fixture project ID cannot
  pass NativeCloud's project check. No account, real Firebase file or cloud writes
  are involved. CI first runs the existing full debug instrumentation suite, then
  upgrades only its disposable emulator to the optimized APK for black-box cold
  start, all six destinations and restart. The optimized target receives no test
  hooks or keep rules for application classes.
- On a user's device, inspect the package/version first. Preserve records; no
  uninstall, data clear, auto sign-in, sync or record edits in the smoke script.
  `--device-acceptance --serial <explicit-device>` only operates the already
  installed optimized preview. Existing data is not a synthetic test fixture.
- A passing navigation smoke test or JVM suite is not optimized Google login,
  cloud restoration, nonempty backup/recipe migration, notification or full UI
  acceptance. Those must be observed separately before enabling R8 on `release`.
- Mapping class counts are not the Play optimization metric. No claim of improved
  startup speed, battery, downloads or crash rate is made from APK size alone.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[Android R8 configuration](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).
