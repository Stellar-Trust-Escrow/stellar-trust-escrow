# StellarTrustEscrow — Mobile App

React Native (Expo) app for iOS and Android.

## Stack

- Expo SDK 52 + Expo Router (file-based navigation)
- React Query for data fetching with offline fallback
- Zustand for wallet state (persisted via MMKV)
- SQLite (expo-sqlite) for offline escrow cache
- expo-local-authentication — Face ID / Fingerprint
- expo-notifications — push notifications
- expo-secure-store — sensitive data storage

## Getting Started

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend URL

npm install
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
```

## Building for Production

Requires [EAS CLI](https://docs.expo.dev/eas/):

```bash
npm install -g eas-cli
eas login
eas build --platform ios      # iOS .ipa
eas build --platform android  # Android .aab
eas build --platform all      # Both
```

## Architecture

```
mobile/
├── app/
│   ├── _layout.tsx          # Root layout (providers, notifications, offline init)
│   ├── (auth)/connect.tsx   # Wallet connect screen
│   ├── (tabs)/              # Main tab navigator (Dashboard, Escrows, Explorer, Profile)
│   ├── escrow/[id].tsx      # Escrow detail (biometric-gated)
│   ├── escrow/create.tsx    # Create escrow + XDR signing flow
│   ├── kyc/index.tsx        # Sumsub KYC WebView
│   └── settings/index.tsx   # Biometric toggle, account info
├── components/
│   ├── escrow/              # EscrowCard, MilestoneItem
│   └── ui/                  # Badge, Button, Card, EmptyState
├── hooks/                   # useEscrows, useReputation, useDebounce
├── lib/                     # api.ts, storage.ts, stellar.ts
├── services/                # biometrics.ts, notifications.ts, offlineCache.ts
└── store/                   # useWalletStore (Zustand)
```

## Mobile Signing Flow

Since Freighter is a browser extension, mobile signing works differently:

1. User enters escrow parameters in the Create screen
2. App sends parameters to backend to build unsigned XDR
3. User copies XDR to a mobile Stellar wallet (LOBSTR, Solar Wallet)
4. User pastes signed XDR back into the app
5. App broadcasts via `POST /api/escrows/broadcast`

## Features

- iOS + Android builds via EAS
- Core escrow features (view, create, milestones, disputes)
- Push notifications (escrow updates, milestone completions, disputes)
- Offline support (SQLite cache, graceful degradation)
- Biometric auth (Face ID / Touch ID / Fingerprint)
- KYC verification via Sumsub WebView
- Dark theme matching the web frontend
