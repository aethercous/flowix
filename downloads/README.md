# worlo Teams downloads

These files are served at `/downloads/` on your deployed site.

| File | Platform |
|------|----------|
| `worlo-teams-setup.exe` | **Windows** — full desktop installer (Electron) |
| `worlo-teams-win.zip` | Windows portable — unzip, run `Open worlo Teams.bat` |
| `worlo-teams-mac.zip` | macOS — unzip, run `Open worlo Teams.command` |

## Rebuild portable zips

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-teams-portable.ps1
```

## Rebuild Windows .exe (local, requires Windows or CI)

```bash
cd worlo-teams-desktop && npm ci && npm run build:win
```

This copies `worlo-teams-setup.exe` into `downloads/`.

GitHub Actions (`.github/workflows/build-worlo-teams.yml`) builds the `.exe` and zips on push to `master`/`main`.

Then **commit** the files in `downloads/` and **redeploy** to Vercel so downloads work in production.

## Browser app

Use: `/teams-app/index.html`

Login: invite code + first/last name + optional nickname.
