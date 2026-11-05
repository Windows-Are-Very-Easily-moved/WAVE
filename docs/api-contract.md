# W.A.V.E — Backend API Contract

**W.A.V.E** (*"Windows Are Very Easily-moved"*) uses a local ASP.NET Core (.NET 8) Web API on `http://localhost:5000` to inspect, focus, move, snap, and scroll native Windows 10/11 desktop windows via Win32 P/Invoke (`user32.dll`, `dwmapi.dll`, `shcore.dll`).

---

## Self-Window Exclusion Rule (`WAVEHUD`)

- The Angular frontend sets `<title>WAVEHUD</title>` in `frontend/src/index.html` and never changes it at runtime.
- The backend configures `"Scepter:SelfWindowTitleMatch": "WAVEHUD"` in `backend/Scepter.Api/appsettings.json` (and defaults to `"WAVEHUD"` in `ForegroundTracker.cs`).
- `ForegroundTracker.IsSelfWindow` ignores any window whose title contains `"WAVEHUD"` (case-insensitive) as well as Picture-in-Picture windows. Both values **must match** so W.A.V.E never grabs, snaps, or locks onto its own HUD browser window.

---

## Base URL & CORS

- **Base URL:** `http://localhost:5000`
- **Allowed CORS Origin:** `http://localhost:4200` (`Scepter:AllowedOrigins` in `appsettings.json`)
- **Platform Guard:** On non-Windows hosts, window and input manipulation endpoints return `501 Not Implemented` with `{ "error": "PlatformNotSupported", "message": "..." }`.

---

## Endpoints

### 1. Health Check
`GET /health` (also aliased at `GET /api/window/health`)

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "platform": "windows",
  "timestamp": "2026-11-05T21:00:00.0000000+00:00"
}
```

### 2. Active Target Window
`GET /api/window/active`

Returns the currently locked or most recently active eligible non-`WAVEHUD` desktop window.

**Response (`200 OK`):**
```json
{
  "handle": 131242,
  "title": "Untitled - Notepad",
  "processName": "Notepad",
  "className": "Notepad",
  "bounds": {
    "left": 100,
    "top": 100,
    "right": 1100,
    "bottom": 800,
    "width": 1000,
    "height": 700
  },
  "isLockedTarget": true
}
```

### 3. Recent Eligible Window Stack
`GET /api/window/list`

Returns the ordered stack of recent eligible desktop windows (most recent first).

### 4. Grab Window at Normalized Coordinates
`POST /api/window/grab`

Converts normalized `[0..1]` screen coordinates `(x, y)` into physical pixels on the active target monitor, performs a Win32 `WindowFromPoint` hit-test (falling back to the last active eligible non-`WAVEHUD` window if the HUD or desktop is hit), and locks onto that window.

**Request Body:**
```json
{
  "x": 0.45,
  "y": 0.52
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "windowTitle": "Untitled - Notepad",
  "appliedRect": { "left": 100, "top": 100, "right": 1100, "bottom": 800, "width": 1000, "height": 700 },
  "message": "Locked onto 'Untitled - Notepad'.",
  "processName": "Notepad",
  "handle": 131242
}
```

### 5. Move Locked Window
`POST /api/window/move`

**Request Body:**
```json
{
  "x": 0.48,
  "y": 0.50,
  "deltaX": 0.03,
  "deltaY": -0.02
}
```

### 6. Snap Locked Window
`POST /api/window/snap`

Snaps the locked target window to a screen edge, corner, or next monitor using `MONITORINFO.rcWork` (never covering the taskbar) and `DWMWA_EXTENDED_FRAME_BOUNDS` invisible border compensation.

**Request Body:**
```json
{
  "position": "left",
  "ratio": 0.5
}
```
Supported `position` values (case-insensitive): `left`, `right`, `top`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `nextMonitor`.

### 7. Resize Locked Window
`POST /api/window/resize`

**Request Body:**
```json
{
  "scaleFactor": 1.2
}
```

### 8. Cycle Target Window
`POST /api/window/cycle`

**Request Body:**
```json
{
  "direction": "next",
  "handle": null
}
```

### 9. V-Sign Mouse Wheel Scroll
`POST /api/input/scroll`

Injects vertical mouse wheel scroll events via Win32 `SendInput` (`MOUSEEVENTF_WHEEL = 0x0800`). When `begin: true` and normalized coordinates `x`, `y` (`0..1`) are provided, converts `(x, y)` to physical screen pixels using the same monitor coordinate mapping as `/api/window/grab` and calls `SetCursorPos` once (configurable via `Scepter:Scroll:MoveCursorToHand`, default `true`) so subsequent wheel events scroll the window under the user's hand.

**Request Body:**
```json
{
  "delta": 120,
  "begin": true,
  "x": 0.5,
  "y": 0.5
}
```
- `delta` (required `int`): Signed wheel delta (positive = scroll up, negative = scroll down). Clamped to `[-1200, 1200]` per request (`Scepter:Scroll:MaxAbsDelta`). `delta: 0` with `begin: true` is valid.
- `begin` (optional `bool`): True on the initial frame entering the `SCROLLING` state.
- `x`, `y` (optional `double` in `[0..1]`): Mirrored normalized hand coordinates used when `begin` is true.

**Response (`200 OK`):**
```json
{
  "success": true
}
```

**Error Response (`400 Bad Request`):**
```json
{
  "success": false,
  "error": "InvalidScrollRequest",
  "message": "A valid integer 'delta' is required."
}
```
