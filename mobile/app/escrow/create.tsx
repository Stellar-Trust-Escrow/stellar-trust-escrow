/**
 * Create Escrow Screen
 *
 * Builds the escrow parameters and generates an unsigned XDR.
 * The user must copy the XDR to their Stellar wallet app to sign,
 * then paste the signed XDR back to broadcast.
 *
 * This is the mobile-native signing flow since Freighter is web-only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWalletStore } from '../../store/useWalletStore';
import { useBroadcastEscrow } from '../../hooks/useEscrows';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { isValidStellarAddress } from '../../lib/stellar';

interface FormState {
  freelancerAddress: string;
  tokenAddress: string;
  totalAmount: string;
  briefHash: string;
  arbiterAddress: string;
  deadline: string;
  signedXdr: string;
}

const INITIAL: FormState = {
  freelancerAddress: '',
  tokenAddress: '',
  totalAmount: '',
  briefHash: '',
  arbiterAddress: '',
  deadline: '',
  signedXdr: '',
};

export default function CreateEscrowScreen() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [step, setStep] = useState<'form' | 'sign' | 'broadcast'>('form');
  const address = useWalletStore((s) => s.address)!;
  const router = useRouter();
  const broadcast = useBroadcastEscrow();

  const set = (key: keyof FormState) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const validateForm = (): string | null => {
    if (!isValidStellarAddress(form.freelancerAddress))
      return 'Invalid freelancer address.';
    if (!isValidStellarAddress(form.tokenAddress))
      return 'Invalid token address.';
    if (!form.totalAmount || isNaN(Number(form.totalAmount)) || Number(form.totalAmount) <= 0)
      return 'Enter a valid amount.';
    if (!form.briefHash.trim())
      return 'Brief hash (IPFS CID) is required.';
    if (form.arbiterAddress && !isValidStellarAddress(form.arbiterAddress))
      return 'Invalid arbiter address.';
    return null;
  };

  const handleProceedToSign = () => {
    const err = validateForm();
    if (err) { Alert.alert('Validation Error', err); return; }
    setStep('sign');
  };

  const handleBroadcast = async () => {
    if (!form.signedXdr.trim()) {
      Alert.alert('Missing XDR', 'Paste the signed transaction XDR from your wallet app.');
      return;
    }
    try {
      const result = await broadcast.mutateAsync(form.signedXdr.trim());
      Alert.alert(
        'Success',
        `Escrow created!\nTx: ${result.hash.slice(0, 16)}…`,
        [{ text: 'View Escrows', onPress: () => router.replace('/(tabs)/escrows') }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Broadcast failed';
      Alert.alert('Error', msg);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'form' && (
            <>
              <Text style={styles.sectionTitle}>Escrow Details</Text>
              <Card style={styles.card}>
                <Field
                  label="Your Address (Client)"
                  value={address}
                  editable={false}
                  placeholder=""
                  onChangeText={() => {}}
                  mono
                />
                <Field
                  label="Freelancer Address *"
                  value={form.freelancerAddress}
                  onChangeText={set('freelancerAddress')}
                  placeholder="G..."
                  mono
                  autoCapitalize="characters"
                />
                <Field
                  label="Token Address (SAC) *"
                  value={form.tokenAddress}
                  onChangeText={set('tokenAddress')}
                  placeholder="C... or G..."
                  mono
                  autoCapitalize="characters"
                />
                <Field
                  label="Total Amount (stroops) *"
                  value={form.totalAmount}
                  onChangeText={set('totalAmount')}
                  placeholder="e.g. 100000000 = 10 XLM"
                  keyboardType="numeric"
                />
                <Field
                  label="Brief Hash (IPFS CID) *"
                  value={form.briefHash}
                  onChangeText={set('briefHash')}
                  placeholder="Qm... or bafy..."
                />
                <Field
                  label="Arbiter Address (optional)"
                  value={form.arbiterAddress}
                  onChangeText={set('arbiterAddress')}
                  placeholder="G..."
                  mono
                  autoCapitalize="characters"
                />
                <Field
                  label="Deadline (ISO date, optional)"
                  value={form.deadline}
                  onChangeText={set('deadline')}
                  placeholder="2026-12-31"
                />
              </Card>
              <Button title="Continue to Sign" onPress={handleProceedToSign} style={styles.btn} />
            </>
          )}

          {step === 'sign' && (
            <>
              <Text style={styles.sectionTitle}>Sign Transaction</Text>
              <Card style={styles.card}>
                <Text style={styles.instructions}>
                  1. Open your Stellar wallet app (LOBSTR, Solar, etc.){'\n'}
                  2. Use the "Sign XDR" or "Import Transaction" feature{'\n'}
                  3. The backend will build the transaction — contact your wallet app to sign the
                  escrow creation transaction for address:{'\n'}
                  <Text style={styles.mono}>{address}</Text>
                  {'\n\n'}
                  4. Paste the signed XDR below and tap Broadcast.
                </Text>
                <Text style={styles.fieldLabel}>Signed XDR *</Text>
                <TextInput
                  style={[styles.input, styles.xdrInput]}
                  value={form.signedXdr}
                  onChangeText={set('signedXdr')}
                  placeholder="Paste signed transaction XDR here…"
                  placeholderTextColor="#4b5563"
                  multiline
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </Card>
              <View style={styles.rowBtns}>
                <Button title="Back" onPress={() => setStep('form')} variant="secondary" style={styles.halfBtn} />
                <Button
                  title="Broadcast"
                  onPress={() => void handleBroadcast()}
                  loading={broadcast.isPending}
                  style={styles.halfBtn}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  mono = false,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable?: boolean;
  mono?: boolean;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'characters';
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, mono && styles.mono, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#4b5563"
        editable={editable}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#f9fafb', marginBottom: 12 },
  card: { marginBottom: 20 },
  fieldContainer: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#d1d5db', marginBottom: 6 },
  input: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#f9fafb',
  },
  inputDisabled: { opacity: 0.6 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  xdrInput: { minHeight: 100, textAlignVertical: 'top' },
  instructions: { fontSize: 14, color: '#9ca3af', lineHeight: 22, marginBottom: 16 },
  btn: { marginTop: 4 },
  rowBtns: { flexDirection: 'row', gap: 12 },
  halfBtn: { flex: 1 },
});
