## 🪄 Windows helper script

There is a PowerShell helper at the repository root: `dev.ps1`. It simplifies common development tasks on Windows:

- Copies `.env.example` to `.env` if missing
- Installs dependencies when `node_modules` is absent
- Runs `npm run dev`, `npm run build`, or `npm run preview`

Usage (PowerShell):

```powershell
# Start dev server via helper
.\dev.ps1

# Or via npm script
npm run dev:win
```

---

## 📎 Capture defaults (public uploader)

For the simplified public uploader the capture parameters are intentionally fixed so users don't need to configure technical details. To change these values edit the centralized config file:

- File: `src/config/capture.ts`
- Constants:
	- `TARGET_FRAMES` (number) — number of frames captured per sample. Default: 60
	- `CAPTURE_COUNT` (number) — number of captures per session. Default: 5

Example (change to 30 frames, 3 captures):

```ts
// src/config/capture.ts
export const TARGET_FRAMES = 30;
export const CAPTURE_COUNT = 3;
```

After editing the constants, rebuild or restart the dev server (`npm run dev`) to pick up the changes. These values are imported by `src/components/FullscreenCaptureModal.tsx` and used to render the minimal UI for public users.
