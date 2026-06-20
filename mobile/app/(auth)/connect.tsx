/**
 * Connect Wallet Screen
 *
 * On mobile there's no Freighter extension. Users connect by entering their
 * Stellar public key. Signing is done via a compatible mobile wallet app
 * (LOBSTR, Solar Wallet) using the XDR copy/paste flow.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore } from '../../store/useWalletStore';
import { isValidStellarAddress } from '../../lib/stellar';
import Button from '../../components/ui/Button';
import { registerForPushNotifications } from '../../services/notifications';
import { isBiometricAvailable } from '../../services/biometrics';
import { storage, STORAGE_KEYS } from '../../lib/storage';

export default function ConnectScreen() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const setWalletAddress = useWalletStore((s) => s.setAddress);
  const router = useRouter();

  const finishConnect = (addr: string) => {
    setWalletAddress(addr);
    // Fire-and-forget — non-critical background registration
    void registerForPushNotifications(addr);
    void router.replace('/(tabs)');
  };

  const handleConnect = async () => {
    const trimmed = address.trim();
    if (!isValidStellarAddress(trimmed)) {
      Alert.alert(
        'Invalid Address',
        'Please enter a valid Stellar public key (starts with G, 56 chars).',
      );
      return;
    }

    setLoading(true);
    try {
      const biometricAvailable = await isBiometricAvailable();
      if (biometricAvailable) {
        Alert.alert(
          'Enable Biometric Auth',
          'Would you like to use Face ID / Fingerprint to secure your account?',
          [
            { text: 'Skip', style: 'cancel', onPress: () => finishConnect(trimmed) },
            {
              text: 'Enable',
              onPress: () => {
                storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, true);
                finishConnect(trimmed);
              },
            },
          ],
        );
      } else {
        finishConnect(trimmed);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.logo}>⭐</Text>
            <Text style={styles.title}>StellarTrust{'\n'}Escrow</Text>
            <Text style={styles.subtitle}>
              Trustless milestone-based escrow{'\n'}powered by Stellar Soroban
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Your Stellar Public Key</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="G..."
              placeholderTextColor="#4b5563"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={() => void handleConnect()}
            />
            <Text style={styles.hint}>
              Enter your Stellar public key to view your escrows. Signing transactions requires a
              compatible mobile wallet (LOBSTR, Solar Wallet).
            </Text>
            <Button
              title="Connect Wallet"
              onPress={() => void handleConnect()}
              loading={loading}
              disabled={address.trim().length < 10}
              style={styles.connectBtn}
            />
          </View>

          <View style={styles.features}>
            {[
              { icon: '🔒', text: 'Biometric authentication' },
              { icon: '📱', text: 'Offline access to your escrows' },
              { icon: '🔔', text: 'Push notifications for updates' },
              { icon: '⛓️', text: 'On-chain Soroban smart contracts' },
            ].map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  flex: { flex: 1 },
  container: { padding: 24, paddingBottom: 48 },
  hero: { alignItems: 'center', paddingVertical: 48 },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: '#f9fafb', textAlign: 'center', lineHeight: 38 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginTop: 12, lineHeight: 22 },
  form: { marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#d1d5db', marginBottom: 8 },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#f9fafb',
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  hint: { fontSize: 12, color: '#4b5563', lineHeight: 18, marginBottom: 20 },
  connectBtn: { marginTop: 4 },
  features: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { fontSize: 20, width: 32, textAlign: 'center' },
  featureText: { fontSize: 14, color: '#9ca3af' },
});
