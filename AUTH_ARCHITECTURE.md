# NOVA Authentication Architecture

## Current local-prototype mode

The app currently uses a local session boundary only:

- `@nova/local-session` stores the current local identity using AsyncStorage.
- `AuthScreen` contains login/signup UI and a guest path.
- The app root gates the main experience until a local session exists.
- The existing fragrance profile API still uses the generated profile ID and file-backed local storage.
- No email, password, or profile data is sent to a cloud provider in this mode.

This is intentionally a prototype boundary, not production authentication. Passwords are not validated or stored.

## Future Supabase/Firebase adapter

Replace the `AuthScreen.submit` local-session write with the selected provider's SDK call:

1. Sign up or sign in with the provider.
2. Store the provider session/token using its recommended secure mechanism.
3. Use the provider user ID as the fragrance profile owner ID.
4. Replace `GET /api/profile/:id` and the file-backed profile store with authenticated database queries.
5. Enforce per-user access rules using Supabase Row Level Security or Firebase Security Rules.
6. Add refresh-token and logout handling before production release.

The rest of the Advisor UI can remain unchanged because it already sends a stable `profileId` and receives a profile object from the backend.
