# Release checklist (Google Play)

Android only for now (`app.allure`). Work through it before the first store upload, then
the "Every release" part each time.

## One-time setup

### Signing key
- [ ] Create the upload key (keep it **outside** the repo):
      `keytool -genkeypair -v -keystore allure-upload.jks -alias allure -keyalg RSA -keysize 2048 -validity 10000`
- [ ] Back it up with its passwords (password manager + an offline copy). Play App Signing
      lets Google reset a lost *upload* key, but that takes days and a support request
- [ ] Point the build at it in `~/.gradle/gradle.properties` (your user folder, never the
      repo; read by `android/app/build.gradle`):
      ```properties
      allureStoreFile=C:/Users/you/keys/allure-upload.jks
      allureStorePassword=…
      allureKeyAlias=allure
      allureKeyPassword=…
      ```
- [ ] Opt in to Play App Signing on the first upload
- [ ] Gradle JDK: Gradle 8.14 can't compile build scripts on JDK 25 (Android Studio's bundled
      JBR): "Unsupported class file major version 69" after any `build.gradle` edit. Set
      Settings → Build Tools → Gradle → Gradle JDK to a JDK 17 or 21, or upgrade Gradle to 9.1+

### Play Console
- [ ] New personal developer accounts must run a **closed test with at least 12 testers
      for 14 days in a row** before production access is granted: start it early
- [ ] Privacy policy at a public URL. `privacy_policy_url` in
      `android/app/src/main/res/values/strings.xml` points to the source on GitHub, which
      only works while the repo is public and is not a readable page: host the policy
      (e.g. GitHub Pages) and update the string
- [ ] Data safety form: location (recording only, stays on the device), health data (heart
      rate, exercise sessions read from Health Connect, stays on the device), no account,
      no data shared, no data collected by a server
- [ ] Health Connect permission declaration: for each permission (exercise, exercise route,
      heart rate, resting heart rate), what it is used for in the app
- [ ] Location: foreground service with the screen off for recording. Declare it and
      say why (workout tracking)
- [ ] Store listing: name Allure, short and full description, screenshots at phone size
      (`docs/screenshots`), feature graphic, icon. Never mention Strava, in text or images
- [ ] Content rating questionnaire, target audience (not for children)

## Every release

- [ ] `npm test` and `npm run build` pass
- [ ] Bump `versionCode` (+1, Play refuses a reused one) and `versionName` in
      `android/app/build.gradle`, and `version` in `package.json`
- [ ] `npm run android`, then in Android Studio: Build → Generate Signed App Bundle (`.aab`)
- [ ] On a real phone, from the release build:
  - [ ] Install over the previous version: activities, settings and photos are still there
  - [ ] Record 1 h or more with the screen off and the phone in a pocket: the track has no
        gap. Check the brands that kill background apps (Samsung, Xiaomi) when you can
  - [ ] Kill the app mid-recording, reopen: the draft comes back
  - [ ] Pair a heart rate strap, walk out of range and back: it reconnects
  - [ ] Import a FIT from a watch, a Strava archive, and Health Connect
  - [ ] Backup, then restore on a fresh install
  - [ ] Both languages (FR / EN) on the screens that changed
- [ ] Upload to the closed or internal track first, then promote
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`

## After the release

- Allure has no backend, so there are no crash reports of its own: watch **Android vitals**
  (crashes, ANRs) and the reviews in the Play Console
