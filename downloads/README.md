# worlo Teams downloads

These files are served at `/downloads/` on your deployed site.

| File | Platform |
|------|----------|
| `worlo-teams-portable.exe` | **Windows** — double-click to run (no unzip) |
| `worlo-teams-setup.exe` | **Windows** — full installer (opens app when done) |
| `worlo-teams-win.zip` | Windows portable — unzip, run `Worlo Teams.bat` |
| `worlo-teams-mac.zip` | macOS — unzip, double-click `Worlo Teams.app` |

## Rebuild portable zips

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-teams-portable.ps1
```

## Windows .exe installer

The standalone `.exe` is **not** committed to the repo (binaries bloat git/Vercel).
It is built by CI and published to GitHub Releases. The download page links to:

```
https://github.com/aethercous/flowix/releases/latest/download/worlo-teams-setup.exe
```

GitHub Actions (`.github/workflows/build-worlo-teams.yml`) builds the `.exe` on push
to `master`/`main` (or via "Run workflow") and uploads it to the `worlo-teams-latest`
release. Until that workflow has run at least once, the `.exe` link 404s — the portable
Windows zip above is the instant-working fallback.

To build locally on Windows:

```bash
cd worlo-teams-desktop && npm ci && npm run build:win
```

## Browser app

Use: `/teams-app/index.html`

Login: invite code + first/last name + optional nickname.
