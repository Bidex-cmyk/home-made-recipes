# Deployment — Staging + Production

> Do not break `https://home-made-recipe-c857f.web.app/` (production). All steps below are non-destructive and keep staging/production data separate.

## 1. Current state (audited 2026-09-15)

| Check | Result | Evidence |
|---|---|---|
| **A. Hosting project** | `home-made-recipe-c857f` | `curl https://home-made-recipe-c857f.web.app/__/firebase/init.json` → `projectId: home-made-recipe-c857f` / `init.js` same |
| **B. Staging project** | **Does not exist yet** | No `.firebaserc` was committed; `firebase.json` has no staging target; no second `projectId` found |
| **C. Firebase CLI auth** | **Not authenticated / not installed** in this workspace | `firebase: command not found`, `npx firebase` not available, no `~/.config/firebase` token |
| **D. Firestore enabled** | **NO** | `GET https://firestore.googleapis.com/v1/projects/home-made-recipe-c857f/databases/(default)/documents/users/test-doc` with valid ID token → `404 database (default) does not exist` → needs setup via Console |
| **E. Storage enabled** | **Not available on Spark plan (gracefully optional)** | Spark plan has no Storage; `storageBucket: home-made-recipe-c857f.firebasestorage.app` in init.json but file uploads intentionally disabled. App uses URL-based images (no `getStorage` init) and `STORAGE_ENABLED=false` in `index.html`. See §3 Spark note. |
| **F. Authentication enabled** | **YES** (Email/Password) | `POST identitytoolkit...accounts:signUp` with `AIzaSyCyCX2lqwIDzgRtAatpjozvHH9k0KTovDw` succeeded, returned `idToken` for `test@example.com` |
| **G. Production site connected to real project** | **YES on hosting, NO in repo** | Hosting serves `init.json` with real config (`AIzaSyCyCX2l...`), but local `index.html` still has `YOUR_API_KEY` placeholder → `demoMode=true` locally. Production deployment from 2026-07-07 is stale (Content-Length 128k vs local 293k) and was likely deployed before demo data |

No Firestore/Storage data to backup (database does not exist). Do not delete project `home-made-recipe-c857f`.

## 2. Architecture

- **Hosting auto-config**: App now fetches `/__/firebase/init.json` when on `*.web.app` / `*.firebaseapp.com`. No hardcoded staging/production keys in repo. Local `file://` or `localhost` without Hosting falls back to `demoMode` (localStorage seed data). See `index.html:5240` `fetchHostingConfig()` + `initFirebase()`.
- **Env badge**: `DEMO` (amber) / `STAGING` (teal) / `PRODUCTION` (hidden) next to logo so you never test the wrong backend.
- **Data layer**: `AppConfig / recipeService / shoppingListService / mealPlanService / cookedService` in `index.html` — UI does not call raw Firestore everywhere; swap to Firestore transparently when `demoMode=false`.
- **Demo mode**: Kept for local dev (`file://`). Production/staging never accidentally run in demo because Hosting auto-config overrides placeholder and sets `demoMode=false`.

## 3. Create staging (one-time, in Firebase Console)

You must create this manually — do not invent credentials.

1. Go to https://console.firebase.google.com/ → Add project → `home-made-recipe-c857f-staging` (or any name; then update `.firebaserc` `staging` field if different).
2. In staging project:
   - **Authentication → Sign-in method**: Enable **Email/Password**. Add Authorized domains: `localhost`, `127.0.0.1`, `<staging>.web.app`, `<staging>.firebaseapp.com`.
   - **Firestore → Create database** → choose **Native mode**, region `eur3` or `us-central` (pick same as production will use), start in **production mode** (rules will be deployed from `firestore.rules`).
   - **Storage — Spark plan: SKIP** — Do **not** create Storage or enable billing. App runs with `STORAGE_ENABLED=false` (file inputs disabled, URL images remain). Keep `storage.rules` committed for future Blaze upgrade only.
   - **Hosting → Get started** → note the staging site URL (`https://<staging>.web.app`).
3. Keep production project `home-made-recipe-c857f` separate:
   - Firestore → Create database (if not already) — **Native mode, production mode**.
   - Storage → **Skip on Spark** — leave disabled; do not upgrade to Blaze unless you need file uploads.
   - Authentication → verify Authorized domains include `home-made-recipe-c857f.web.app`, `home-made-recipe-c857f.firebaseapp.com`, `localhost`.

> **Spark plan note:** `firebase.json` no longer includes `storage` block, `package.json` deploys `hosting+firestore` only, and `index.html` never calls `getStorage` unless `STORAGE_ENABLED=true`. No billing required.

No data migration needed — staging and production must stay isolated.

## 4. Local setup (developer)

```bash
npm install          # installs firebase-tools
npx firebase login   # opens browser, authenticates CLI
npx firebase use production   # or staging
npx firebase emulators:start --only auth,firestore      # Spark: no storage emulator needed
# Full (Blaze only): npx firebase emulators:start --only auth,firestore,storage
```

Copy `.env.example` → `.env.local` if you want to test with explicit config locally (otherwise `file://` stays in demoMode and Hosting preview uses auto-config).

Never commit `.env.local` or service-account JSON.

## 5. Deploy rules & hosting (non-destructive)

```bash
# Preview what will deploy (Spark: hosting + firestore only)
npx firebase deploy --only firestore:rules --project staging --dry-run
npx firebase deploy --only hosting,firestore --project staging --dry-run

# Staging (hosting + firestore only — no storage on Spark)
npm run deploy:staging
# Production (only after verifying staging)
npm run deploy:production
# Rules only (firestore)
npm run deploy:rules
# Storage only (requires Blaze) — not used on Spark:
# npm run deploy:storage
```

`firebase.json` points at `firestore.rules` only on Spark (storage block removed to avoid deploy failures). `storage.rules` is kept in repo for future Blaze upgrade. Firestore rules are locked down (owner-only writes, participant-only messaging) — do not weaken for testing.

Check in Console → Firestore Rules / Storage Rules after deploy that they match committed files.

## 6. Verification checklist (run after Firestore/Storage enabled)

- [ ] `curl https://<staging>.web.app/__/firebase/init.json` shows staging `projectId`
- [ ] Sign up / login / logout / password reset works on staging and production separately (different users)
- [ ] Authenticated user can create own recipe/post, cannot edit another user's doc (test with `gcloud` or two test accounts)
- [ ] Unauthenticated write rejected
- [ ] Storage (Spark: skipped) — File input is disabled in UI; image URLs still work for posts / “I Cooked This” (verified: `videoFile` input is disabled with helper text, `STORAGE_ENABLED=false`)
- [ ] `/__/firebase/init.json` on production still `home-made-recipe-c857f`, no demo banner visible

## 7. Rollback / safety

- Production URL continues to serve last successful deployment if new deploy fails.
- Firestore has no data yet → no backup needed. Once live data exists, use `gcloud firestore export gs://<bucket>/backups` before destructive migrations.
- Never delete project `home-made-recipe-c857f`. Use `firebase hosting:clone` for preview channels instead of overwriting.

## 8. Secrets

Client web `apiKey` is not a secret (it's in `init.json` publicly). Do not put Admin SDK service-account keys in frontend. Use Firebase Admin only server-side via `GOOGLE_APPLICATION_CREDENTIALS`.

