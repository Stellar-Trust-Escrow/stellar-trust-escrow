/**
 * Settings Screen
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  getSupportedBiometricTypes,
} from '../../services/biometrics';
import Card from '../../components/ui/Card';
import { useWalletStore } from '../../store/useWalletStore';
import { truncateAddress } from '../../lib/stellar';

export default function SettingsScreen() {
  const address = useWalletStore((s) => s.address)!;
  const network = useWalletStore((s) => s.network);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricTypes, setBiometricTypes] = useState<string[]>([]);

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricAvailable);
    void getSupportedBiometricTypes().then(setBiometricTypes);
  }, []);

  const toggleBiometric = (val: boolean) => {
    if (val && !biometricAvailable) {
      Alert.alert('Not Available', 'Biometric authentication is not set up on this device.');
      return;
    }
    setBiometricEnabled(val);
    setBiometricOn(val);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <Text style={styles.section}>Account</Text>
        <Card style={styles.card}>
          <SettingRow label="Address" value={truncateAddress(address, 8, 6)} />
          <SettingRow label="Network" value={network} />
        </Card>

        {/* Security */}
        <Text style={styles.section}>Security</Text>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Text style={styles.switchLabel}>
                {biometricTypes.length > 0 ? biometricTypes.join(' / ') : 'Biometric Auth'}
              </Text>
              <Text style={styles.switchSub}>
                {biometricAvailable
                  ? 'Require authentication to open the app'
                  : 'Not available on this device'}
              </Text>
            </View>
            <Switch
              value={biometricOn}
              onValueChange={toggleBiometric}
              trackColor={{ false: '#374151', true: '#4338ca' }}
              thumbColor={biometricOn ? '#6366f1' : '#9ca3af'}
              disabled={!biometricAvailable}
            />
          </View>
        </Card>

        {/* About */}
        <Text style={styles.section}>About</Text>
        <Card style={styles.card}>
          <SettingRow label="Version" value="1.0.0" />
          <SettingRow label="Network" value={network === 'mainnet' ? 'Mainnet' : 'Testnet'} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 16, paddingBottom: 48 },
  section: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  card: { marginBottom: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  settingLabel: { fontSize: 14, color: '#d1d5db' },
  settingValue: { fontSize: 14, color: '#9ca3af', fontFamily: 'monospace' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  switchLeft: { flex: 1, marginRight: 16 },
  switchLabel: { fontSize: 14, color: '#d1d5db', fontWeight: '500' },
  switchSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
