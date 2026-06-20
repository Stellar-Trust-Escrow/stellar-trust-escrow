import { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { getCachedEscrow, type Escrow } from '../../services/offlineCache';

function isBiometricEnabled(): boolean {
  return true;
}

export default function EscrowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function authenticate() {
      if (!isBiometricEnabled()) {
        setAuthed(true);
        setAuthChecked(true);
        return;
      }

      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to view escrow details',
          fallbackLabel: 'Use passcode',
        });
        setAuthed(result.success);
      } catch {
        setAuthed(false);
      } finally {
        setAuthChecked(true);
      }
    }

    authenticate();
  }, []);

  useEffect(() => {
    if (!authChecked || !authed || !id) return;

    async function loadEscrow() {
      setIsLoading(true);
      try {
        const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${API_URL}/api/escrows/${id}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setEscrow(data);
      } catch {
        const cached = getCachedEscrow(id);
        setEscrow(cached);
      } finally {
        setIsLoading(false);
      }
    }

    loadEscrow();
  }, [id, authChecked, authed]);

  if (!authChecked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Verifying identity...</Text>
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Authentication required to view escrow details.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading escrow...</Text>
      </View>
    );
  }

  if (!escrow) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Escrow not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escrow #{escrow.id}</Text>
      <View style={styles.statusRow}>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{escrow.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0f172a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
  },
  value: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
});
