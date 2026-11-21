# Daru / 다루

Local-first React + TypeScript + Electron calendar prototype. macOS is the target platform. Browser storage is a separate test adapter and does not synchronize with desktop data.

## Run
Node.js 24:
```sh
npm ci
npm test
npm start
```
`npm run build` validates types and builds. `npm run pack:mac` on macOS prepares arm64/x64 DMG and ZIP candidates. No signing or notarization credentials are included. Native installation is not yet verified.

## Features
Five-day calendar, agenda, task/list/tag/priority panel, hour-slot scheduling, drag move/resize, completion, editing, deletion/undo, JSON export. Asia/Seoul date interpretation. Adjustable hour height and collapsible time interval with task summaries. Keyboard-accessible edit forms. Korean rule-based capture with ambiguity confirmation; no AI model is connected. A persistent textarea preserves composition events and suppresses submission while composing.

Desktop data is stored in Electron userData/records.json with serialized atomic writes and one backup. Browser demo uses localStorage. No encryption or cross-device synchronization is claimed. Settings show the actual data path. Desktop global shortcut defaults to CommandOrControl+Alt+Shift+D, configurable or removable; failed registration preserves the previous shortcut. No general keyboard monitoring. The app must be running.

## Verification
Automated domain, file persistence, React/jsdom interaction and mock shortcut tests included. Actual macOS trackpad pinch, Korean IME, global-shortcut activation from another app, DMG installation, signing/notarization and browser pointer interaction still require manual acceptance. Overlapping event columns and cross-midnight visual continuation need further work.

## Releases and future integrations
Branch pushes/PRs run CI. Version tags build unsigned macOS candidates. Draft release creation is gated by DARU_RELEASE_ENABLED and a release-review environment; configure required reviewers before enabling. No tag or release is created automatically by this source. Automatic updates are disabled until signed/notarized packages and an authenticated delivery path are verified. No long-lived tokens belong in the app.

AI chat, MCP command service, source-based scheduled review, notifications, and actual-time statistics are not implemented. Model subscription compatibility must be verified through official supported integrations; do not substitute paid API usage or reuse browser session credentials.

Electron global shortcuts: https://www.electronjs.org/docs/latest/api/global-shortcut
Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation/
