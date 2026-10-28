# TLNotes

A private timeline. Notes stay on the device. Version **0.4.0-beta**.

This is beta: the journal is usable, and some edges are still open. Sharing into the Android app, a signed iPhone build, and a release signature are not finished.

## Run it in a browser

```bash
npm install
npm run dev
```

The app is at `http://127.0.0.1:8080/`. Return starts a new line. Shift+Return adds the note. Settings can switch that. A static copy, the kind a host such as surge.sh serves, is `dist/client` after:

```bash
npm run build:static
```

## Android

The Android project is `android/`. From this folder, not from inside `android/`:

```bash
npm run android:sync
npx cap run android
```

`android:sync` builds the static site and copies it into the app. Do not run `cap add android`. That would replace the share and sync pieces already in the project.

A debug package does not need a release key:

```bash
chmod +x android/gradlew
android/gradlew -p android assembleDebug
```

The package is `android/app/build/outputs/apk/debug/app-debug.apk`. The version on that package is `0.4.0-beta`.

## iOS

There is no `ios/` project in the tree yet. Capacitor can create one:

```bash
npm run build:static
npx cap add ios
npx cap sync ios
npx cap open ios
```

That has to be built on a Mac, in Xcode. A build that only checks that the project compiles can skip signing. A build you install on a phone needs an Apple developer certificate, and that secret is not in this repository.

## GitHub

`.github/workflows/native.yml` runs when you start it by hand, or when you push a tag such as `v0.4.0-beta`.

`.github/workflows/pages.yml` publishes the static site to GitHub Pages on every push to `main`. The address is [https://tpqwz.github.io/tlnotes/](https://tpqwz.github.io/tlnotes/). That copy is built with its files under `/tlnotes/`. A surge or Capacitor build stays at `/`.

- The Android job produces a debug `.apk` and keeps it as an artifact. It is installable. It is not a Play Store package.
- The iOS job creates the Xcode project if it is missing and compiles it for the simulator without signing. It does not produce an `.ipa` you can tap to install.

A signed Android release needs a keystore stored as a GitHub secret. A signed iOS release needs the Apple certificate and a provisioning profile, also as secrets. Neither is wired yet, because those keys should not be committed.

## License

The application code is [MIT](LICENSE), copyright 2026 Dysig Ignoramus. Forks and contributions are welcome.

Borrowed work keeps its own license. The Monaspace fonts are SIL Open Font License. The npm dependencies stay under their own terms. The Grok app-builder scaffold is not relicensed. See [NOTICE](NOTICE).
