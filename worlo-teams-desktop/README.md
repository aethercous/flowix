# worlo Teams (desktop)

Electron wrapper for the worlo Teams web app. Same UI and invite-code flow as the browser version at `/teams-app`.

## Requirements

- Node.js 18+
- npm

## Run locally (development)

From this folder:

```bash
npm install
npm start
```

Opens `../teams-app/index.html` in a native window.

## Build installers for the website `/downloads/` folder

From the repo root (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-teams-portable.ps1
```

This produces:

- `downloads/worlo-teams-win.zip` — Windows 11 portable (unzip, run `worlo Teams.exe`)
- `downloads/worlo-teams-mac.zip` — macOS portable (unzip, run `Open worlo Teams.command`)

Deploy those files with your static site (Vercel). The Windows zip is ~110 MB; run the script before each deploy that should offer Windows downloads.

Optional NSIS `.exe` (may require admin / signing tools on Windows):

```bash
npm install
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:win
```

## Hosted URL override

Set `WORLO_TEAMS_URL` to load a deployed build instead of bundled files, for example:

```bash
set WORLO_TEAMS_URL=https://your-site.vercel.app/teams-app/index.html
npm start
```

## How teammates use it

1. Admin signs in to the [worlo dashboard](../dashboard.html#teams).
2. Generates an invite code for an agent (expiration down to the minute).
3. Teammates install worlo Teams or open it in the browser.
4. Paste `WORLO-XXXX-XXXX-XXXX` and chat.

Admins can revoke codes or disable Teams for an agent anytime in the dashboard.
