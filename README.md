# Eva — public releases

This repository holds the **built public release** of Eva (EVA-JARVIS).

It is a distribution repository, not a source repository: it contains the
production build that users download and run.

## What is here

| Path | What it is |
|---|---|
| `release-public/Eva-Setup-1.0.1.exe` | Windows installer (x64) |
| `release-public/Eva-Portable-1.0.1.exe` | Portable build — no install needed |
| `release-public/Eva-Setup-1.0.1.exe.blockmap` | Differential-download map used by the auto-updater |
| `release-public/latest.yml` | Update manifest the in-app updater reads |
| `release-public/win-unpacked/` | The fully built application, unpacked |

The large binaries are stored with **Git LFS** so they can be tracked in git
without hitting GitHub's 100 MB per-file limit.

## Installing

1. Download `Eva-Setup-1.0.1.exe` and run it.
2. Windows SmartScreen will warn that the publisher is unknown — the build is
   not code-signed. Choose **More info → Run anyway**.
3. On first run, sign in with your Eva account. The **Free** plan already
   includes managed AI access, so no API key is required.

## Updating

Eva checks for updates on startup and from **Settings → Updates**. The
updater reads `latest.yml` from this repository's Releases page, so a newer
version is downloaded and installed without any manual step.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Managed AI (Gemini) | included | included |
| Daily request allowance | 50 | 500 |
| Connected apps (Composio) | included | included |
| Bring your own model API key | — | included |
| Custom providers | — | included |

## Notes

- Version: **1.0.1**
- Platform: Windows x64
- Sign-in and entitlements are handled by the Eva backend; keys and account
  data are never part of this repository.
