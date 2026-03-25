/**
 * KYC Verification Screen
 *
 * Loads the Sumsub KYC widget in a WebView.
 * The backend generates a short-lived SDK token for the connected address.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useWalletStore } from '../../store/useWalletStore';
import { kycApi } from '../../lib/api';
import Button from '../../components/ui/Button';

export default function KycScreen() {
  const address = useWalletStore((s) => s.address)!;
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadKycStatus();
  }, []);

  const loadKycStatus = async () => {
    setLoading(true);
    try {
      const { data } = await kycApi.getStatus(address);
      setStatus(data.status ?? 'Pending');
      if (data.status !== 'Approved') {
        const tokenRes = await kycApi.getToken(address);
        setToken(tokenRes.data.token);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load KYC status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#6366f1" size="large" style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (status === 'Approved') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>KYC Approved</Text>
          <Text style={styles.successText}>
            Your identity has been verified. You can now use fiat on-ramp features.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load KYC widget.</Text>
          <Button title="Retry" onPress={loadKycStatus} style={styles.retryBtn} />
        </View>
      </SafeAreaView>
    );
  }

  // Sumsub WebSDK loaded in a WebView
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://static.sumsub.com/idensic/static/sns-websdk-builder.js"></script>
    </head>
    <body style="margin:0;background:#0f0f0f;">
      <div id="sumsub-websdk-container"></div>
      <script>
        var snsWebSdkInstance = snsWebSdk
          .init('${token}', () => Promise.resolve('${token}'))
          .withConf({ lang: 'en' })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .on('idCheck.onStepCompleted', (payload) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stepCompleted', payload }));
          })
          .on('idCheck.onApplicantStatusChanged', (payload) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'statusChanged', payload }));
          })
          .build();
        snsWebSdkInstance.launch('#sumsub-websdk-container');
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <WebView
        source={{ html }}
        style={styles.webview}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type: string; payload?: { reviewStatus?: string } };
            if (msg.type === 'statusChanged' && msg.payload?.reviewStatus === 'completed') {
              void loadKycStatus();
            }
          } catch {
            // ignore malformed messages
          }
        }}
        javaScriptEnabled
        domStorageEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  loader: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '700', color: '#f9fafb', marginBottom: 8 },
  successText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
  errorText: { fontSize: 15, color: '#9ca3af', marginBottom: 20 },
  retryBtn: { width: 160 },
});
