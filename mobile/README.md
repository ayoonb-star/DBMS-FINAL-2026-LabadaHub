# LabadaHub Laundry Booking and Management mobile app

Expo and React Native app for customer bookings and branch operations. The mobile app uses local sample data; it is not connected to the web prototype's backend or a database.

## Run

```bash
npm install
npx expo start
```

Open the project in Expo Go, an Android emulator, an iOS simulator, or the web preview.

## Backend authentication setup

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_BASE_URL`.
For a physical phone, replace `YOUR_COMPUTER_LAN_IP` with the computer's LAN
IPv4 address (find it with `ipconfig` on Windows). Keep the phone and computer
on the same network and allow the backend through the computer's firewall on
port 5000. `localhost` is for the computer itself and will not reach the
backend from a physical phone.

Restart Expo after changing `.env.local`. The Expo app uses the backend for
registration, login, session restoration, logout, and admin-created staff
invitations. Native apps store the JWT with SecureStore; the web preview uses
browser local storage because SecureStore is not supported on web.

## Screens

- **Sign in / sign up:** separate Client, Staff, and Admin sign-in portals and forms. Client registration is open; staff/admin registration requires a one-time invitation generated from the Admin screen.
- **Book:** choose a service, load size, add-ons, available drop-off date and time, and wash notes. Wash-Dry-Fold bookings on Mondays and Wednesdays receive a 10% discount.
- **Orders:** view the booking reference, estimated or verified price, and order progress.
- **Staff:** record verified weight or item count, update processing status, and calculate payment change.
- **Admin:** review sample store metrics, slot capacity, service volume, and recent floor activity.

Booking state is shared in the running app and resets when it restarts. The dashboard metrics and staff activity are sample data. Authentication uses the LabadaHub backend; there is no built-in demo account.
