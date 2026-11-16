# Fresh Stream Laundry — frontend

React + Vite implementation of the **Laundry** Figma file (4 mobile screens, 390px wide).

## Run it in VS Code

1. Install [Node.js 18+](https://nodejs.org) and open this folder in VS Code (`File → Open Folder`).
2. Open the integrated terminal (`Ctrl + ` `) and run:

   ```bash
   npm install
   npm run dev
   ```
3. Open the URL it prints (usually http://localhost:5173). Use your browser's device toolbar (F12 → phone icon) for the best mobile view.

## Screens

| Tab          | File                   | Figma frame |
| ------------ | ---------------------- | ----------- |
| Book / Home  | `src/pages/Book.jsx`   | User        |
| My Orders    | `src/pages/Orders.jsx` | Payment     |
| Staff Intake | `src/pages/Staff.jsx`  | Staff       |
| Admin Stats  | `src/pages/Admin.jsx`  | Admin       |

Shared pieces live in `src/components/` (Header, BottomNav, Icon, Qr). Colors, spacing and type
tokens are CSS variables at the top of `src/styles.css`.

## What works

- **Book:** pick a service, adjust weight (kg / items), toggle add-ons, choose a date and open time slot; the total updates live. "Confirm Booking" jumps to My Orders.
- **Orders:** 8-step journey, claim stub, SMS toggle, refresh button.
- **Staff:** ±0.1 kg scale control recalculates the certified total; amount received → change; status buttons update "Current:"; pay-method toggle.
- **Admin:** slot-capacity bars; "Expand 2 slots" reopens the full 1:00 PM window.

All data is hard-coded sample data from the design. Nothing talks to a backend yet.

## Stand-ins to replace

The sandbox this was generated in couldn't download Figma's exported assets, so:

- **Icons** are inline SVGs in `src/components/Icon.jsx` (close to the design, not pixel-identical). To use the exact ones, export them from Figma (select layer → Export → SVG), drop them in `src/assets/icons/`, and import them in place of `<Icon />`.
- **Logo** (header) is a droplet in a circle; the logo layer in the Figma file had no exportable content.
- **QR code** is a placeholder pattern. Use a package like `qrcode.react` once you have real order data.
