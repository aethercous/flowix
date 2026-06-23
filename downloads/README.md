# worlo Teams downloads

These files are served at `/downloads/` on your deployed site.

| File | Platform |
|------|----------|
| `worlo-teams-win.zip` | Windows 11 — unzip, run `Open worlo Teams.bat` |
| `worlo-teams-mac.zip` | macOS — unzip, run `Open worlo Teams.command` |

## Rebuild

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-teams-portable.ps1
```

Then **commit** both zip files and **redeploy** to Vercel so downloads work in production.

## Browser app

Use: `/teams-app/index.html` (not `/teams` without redirect).
