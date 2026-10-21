# EVA-JARVIS 1.0.3 — Windows desktop source

Eva is a 3D AI companion for Windows: she talks with you by voice (Google Gemini Live),
can see your screen or webcam when you explicitly enable those controls, controls apps and
files on your PC, and lives on your desktop as a character you can drag onto windows.

This pack is the full source. If you just want to use Eva, install the setup .exe instead.

## What is NOT included (on purpose)

- **No provider key.** Free-tier *text, vision and tool* calls go through the hosted
  `managed-provider-call` proxy after you sign in, so the installer contains no API key.
  You can still connect your own Gemini key from Settings → AI models if you prefer.
  Live voice needs your own Gemini key (Gemini Live is a WebSocket API and cannot be
  proxied through the HTTP relay).
- **No 3D character model.** The models used while developing Eva have licences that forbid
  redistribution. Import your own MMD model (.pmx, or a .zip / folder containing one) in the app:
  the first screen offers **Import my character**, or use Settings → Character → Character Studio.
  Only use models whose licence allows your use.
- No personal data, logs, memories or settings.

## Requirements

- Windows 10 or 11 (64-bit)
- Node.js 20 or newer (https://nodejs.org)
- Python 3.11 (only to run or rebuild the desktop agent from source)

## Run it in development

```
npm install
pip install -r desktop_agent/requirements.txt
npm run dev
```

Open http://127.0.0.1:3000 in Chrome. Sign in or create an account; the Free tier
works without a personal Gemini key. A key you add yourself is stored encrypted with
Windows DPAPI in your user data folder, never in the project.

Desktop app (Electron, with the desktop companion):

```
npm run app
```

Optional: copy `.env.example` to `.env` for development settings. Do not put a real key in a file
you share.

## Build the installer

1. Build the desktop agent (PyInstaller):
   ```
   pip install pyinstaller
   pyinstaller desktop_agent.spec --distpath agent_dist --workpath agent_build
   ```
   Re-run this whenever `desktop_agent/` changes. Tool modules are imported
   dynamically, so any new one must be listed in `desktop_agent.spec`
   (`hiddenimports`), otherwise it will not be bundled. `registry.load_all()`
   now logs and skips a module that fails to load instead of crashing the agent.
2. Build the public installer (no bundled character):
   ```
   npm run dist:public
   ```
   Output: `release-public/Eva-Setup-<version>.exe`

`npm run dist` (electron-builder.yml) expects a character in `assets/characters/`, which is not
included; use `dist:public`.

## Documentation

Keep the documentation set intentionally small:

- `EVA_JARVIS_FULL_DOCUMENTATION.md` — architecture, PRD summary, local-memory design, feature inventory, security boundaries, testing evidence, limitations and roadmap.
- `OFFICE_AUTOMATION_REPORT.md` — the Office Automation system: architecture, supported
  formats and operations, the Composio capability registry, the security controls, the
  test evidence (including what was **not** verified live), the known limitations, manual
  test steps and the release assessment.
- This README — quick setup and project map.

The documentation distinguishes automated test coverage from live-service or packaged-app verification. A passing build does not mean every integration or desktop workflow has been verified. Local memory is the intended architecture; do not configure an external memory service to run the core memory system.

## Project map

| Folder | What it is |
|---|---|
| `src/` | React UI, the 3D character engine (three.js, MMD/PMX), desktop companion renderer |
| `electron/` | Desktop shell: windows, tray, desktop companion brain, crash recovery |
| `server.ts`, `runtime/` | Local backend (Express + WebSocket), Gemini Live bridge |
| `remote/`, `relay/` | Remote access: phone-control gateway, pairing, and the standalone relay |
| `agent/` | PC-control agent: planner, actions, WhatsApp/chat helpers, safety checks |
| `desktop_agent/` | Python tool server (UI Automation, input, files, apps, Office documents) |
| `office/` | Office Automation: documents, spreadsheets, PDF, presentations, email, calendar, the office agent and its REST routes |
| `models/` | Model router (Gemini and others) |
| `voice/` | Live voice tools |
| `settings/`, `permissions/`, `secrets/` | Settings, permission engine, DPAPI key store |
| `character_import/` | PMX importer and capability report |
| `cognition/`, `memory/`, `presence/` | Memory, initiative and presence |

## Remote access (control this PC from your phone)

Opt-in and off by default. Set `EVA_ENABLE_REMOTE=true` and `EVA_RELAY_URL` (the WSS
address of your relay), then run the relay with `npm run relay`. Pair a phone from
Settings → Remote access, open the emailed (or on-screen) link on the phone, sign in
with the same account and approve the device on the PC. See `docs/REMOTE_ACCESS.md`.

## Graphics quality

Settings → Character → Graphics quality: Auto, High, Medium, Optimized, Potato PC.
Auto steps down by itself if the character crashes on a weak GPU.

## Safety

- The managed provider key never ships in the app. Free-tier calls go through the local
  backend to the hosted Supabase proxy using the signed-in user's JWT; a personal key
  never reaches the web page.
- Webcam access starts only when requested in Eva's camera controls or by an explicit voice command. On-demand mode sends a still image only when you ask; optional Live Visual mode sends one still frame every 10 seconds. Eva does not store webcam frames, and webcam access is separate from screen sharing.
- Webcam images are sent to Gemini for visual analysis. Use the visible camera status and Stop camera control to pause or end access immediately.
- High-risk actions (sending messages, deleting, installing, purchases) ask for confirmation.
- Text from websites, documents and the screen is treated as untrusted data.
- Stop everything any time with the emergency shortcut (default Ctrl+Alt+Shift+S).
