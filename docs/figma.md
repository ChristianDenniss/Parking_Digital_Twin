# Figma – Parking lot SVGs

Design file for lot maps and spot layouts:

**Figma:** [Parking Lot SVGs](https://www.figma.com/design/QDDoFP63VBhhGUEAbM6J0H/Parking-Lot-SVGs?node-id=0-1&t=OmokzgOiqOu1ibUh-1)

Export SVGs into `FE/src/images/svgs/` with one file per lot (e.g. `TimedParking1.svg`). Each spot layer should have `data-spot-label` (e.g. `A-001`); layers with "BG" in the name are ignored as background layers when creating spots. **After adding new SVG files, restart the frontend dev server** so they show up (Vite’s glob is fixed at startup).

You need to export using a SVG ID plugin to get the full proper naming in the SVG file not just rect
