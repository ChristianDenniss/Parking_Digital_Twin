# Lot heat map SVGs

Place one SVG file per parking lot here. The app loads them by **lot ID** (UUID).

- **Filename:** `{lot-id}.svg`  
  Example: `a1b2c3d4-e5f6-7890-abcd-ef1234567890.svg`  
  (Get the ID from the lot detail URL when viewing a lot, or from your API/database.)

- **Inside the SVG:** Each spot must be a separate element (e.g. `<rect>`, `<path>`, `<polygon>`) with:
  - **`data-spot-label`** = the exact spot label from the API (e.g. `GE-A-001`, `ST-B-042`).

The app will:
- Color each shape by status: **green** = free, **red** = taken.
- Make shapes clickable to toggle occupied/empty (if you pass `onSpotClick`).

Spot labels come from your seed/API (e.g. `{prefix}-{row}-{index}` like `GE-A-001`). Match them exactly in the SVG.
