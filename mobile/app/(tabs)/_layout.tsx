/**
 * Tab navigator — guards unauthenticated users to the connect screen.
 */

import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useWalletStore } from '../../store/useWalletStore';
import { authenticate, isBiometricEnabled } from '../../services/biometrics';

export default function TabsLayout() {
  const isConnected = useWalletStore((s) => s.isConnected);
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) {
      router.replace('/(auth)/connect');
      return;
    }
    // Biometric gate on app open
    if (isBiometricEnabled()) {
      void authenticate('Authenticate to access your escrows').then((ok) => {
        if (!ok) router.replace('/(auth)/connect');
      });
    }
  }, [isConnected, router]);

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#0f0f0f',
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#4b5563',
        headerStyle: { backgroundColor: '#0f0f0f' },
        headerTintColor: '#f9fafb',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="escrows"
        options={{ title: 'Escrows', tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} /> }}
      />
      <Tabs.Screen
        name="explorer"
        options={{ title: 'Explorer', tabBarIcon: ({ color }) => <TabIcon emoji="🔍" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === '#6366f1' ? 1 : 0.5 }}>{emoji}</Text>;
}
