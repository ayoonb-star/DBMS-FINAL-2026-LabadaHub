# LabadaHub Laundry Booking and Management mobile app

Expo and React Native app for customer bookings and branch operations. The mobile app uses local sample data; it is not connected to the web prototype's backend or a database.

## Run

```bash
npm install
npx expo start
```

Open the project in Expo Go, an Android emulator, an iOS simulator, or the web preview.

## Screens

- **Sign in / sign up:** separate Client, Staff, and Admin sign-in portals and forms. Client registration is open; staff/admin registration requires a one-time invitation generated from the Admin screen.
- **Book:** choose a service, load size, add-ons, available drop-off date and time, and wash notes. Wash-Dry-Fold bookings on Mondays and Wednesdays receive a 10% discount.
- **Orders:** view the booking reference, estimated or verified price, and order progress.
- **Staff:** record verified weight or item count, update processing status, and calculate payment change.
- **Admin:** review sample store metrics, slot capacity, service volume, and recent floor activity.

Booking and account state are shared in the running app and reset when it restarts. The dashboard metrics and staff activity are sample data. Authentication is a local demo only, not production security: use the **Use demo admin account** button on the sign-in screen to enter the admin dashboard and generate staff/admin invitations. Connect a backend authentication service before using real accounts.
