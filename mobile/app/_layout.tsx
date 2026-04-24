/**
 * Root layout — sets up providers, initialises services, handles deep links.
 */

import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWalletStore } from '../store/useWalletStore';
import { initOfflineDb } from '../services/offlineCache';
import { setupNotificationListeners } from '../services/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initOfflineDb();

    const cleanup = setupNotificationListeners(
      () => {}, // foreground — banner handles it
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.escrowId) {
          void router.push(`/escrow/${data.escrowId}`);
        }
      },
    );

    return cleanup;
  }, [hydrate, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0f0f0f' },
              headerTintColor: '#f9fafb',
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: '#0f0f0f' },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="escrow/[id]" options={{ title: 'Escrow Details' }} />
            <Stack.Screen name="escrow/create" options={{ title: 'Create Escrow' }} />
            <Stack.Screen name="profile/[address]" options={{ title: 'Profile' }} />
            <Stack.Screen name="kyc/index" options={{ title: 'KYC Verification' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
