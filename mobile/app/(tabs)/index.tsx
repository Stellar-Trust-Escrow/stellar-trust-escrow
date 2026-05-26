/**
 * Dashboard Tab
 *
 * Shows a summary of the connected user's escrow activity:
 * active escrows, reputation score, recent events.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWalletStore } from '../../store/useWalletStore';
import { useUserEscrows } from '../../hooks/useEscrows';
import { useReputation, getReputationBadge } from '../../hooks/useReputation';
import EscrowCard from '../../components/escrow/EscrowCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { truncateAddress, stroopsToXlm } from '../../lib/stellar';

export default function DashboardScreen() {
  const address = useWalletStore((s) => s.address)!;
  const router = useRouter();

  const { data: escrowsData, isLoading: escrowsLoading, refetch } = useUserEscrows(address);
  const { data: reputation } = useReputation(address);

  const escrows = escrowsData?.data ?? [];
  const activeEscrows = escrows.filter((e) => e.status === 'Active');
  const badge = reputation ? getReputationBadge(Number(reputation.totalScore)) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={escrowsLoading} onRefresh={refetch} tintColor="#6366f1" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.address}>{truncateAddress(address, 8, 6)}</Text>
          </View>
          <TouchableOpacity onPress={() => void router.push('/settings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Reputation card */}
        {reputation && (
          <Card style={styles.reputationCard}>
            <View style={styles.repRow}>
              <View>
                <Text style={styles.repScore}>{reputation.totalScore.toString()}</Text>
                <Text style={styles.repLabel}>Reputation Score</Text>
              </View>
              {badge && (
                <View style={[styles.repBadge, { backgroundColor: badge.color + '22' }]}>
                  <Text style={[styles.repBadgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              )}
            </View>
            <View style={styles.repStats}>
              <StatPill label="Completed" value={reputation.completedEscrows} />
              <StatPill label="Disputed" value={reputation.disputedEscrows} />
              <StatPill label="Won" value={reputation.disputesWon} />
              <StatPill label="Volume" value={`${stroopsToXlm(reputation.totalVolume)} XLM`} />
            </View>
          </Card>
        )}

        {/* Quick actions */}
        <View style={styles.actions}>
          <Button
            title="+ New Escrow"
            onPress={() => void router.push('/escrow/create')}
            style={styles.actionBtn}
          />
          <Button
            title="Explorer"
            onPress={() => void router.push('/(tabs)/explorer')}
            variant="secondary"
            style={styles.actionBtn}
          />
        </View>

        {/* Active escrows */}
        <Text style={styles.sectionTitle}>
          Active Escrows ({activeEscrows.length})
        </Text>

        {escrowsLoading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : activeEscrows.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No active escrows"
            subtitle="Create your first escrow to get started"
          />
        ) : (
          activeEscrows.map((e) => (
            <EscrowCard key={e.id} escrow={e} userAddress={address} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 13, color: '#6b7280' },
  address: { fontSize: 16, fontWeight: '700', color: '#f9fafb', fontFamily: 'monospace' },
  settingsIcon: { fontSize: 22 },
  reputationCard: { marginBottom: 16 },
  repRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  repScore: { fontSize: 32, fontWeight: '800', color: '#f9fafb' },
  repLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  repBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  repBadgeText: { fontSize: 13, fontWeight: '700' },
  repStats: { flexDirection: 'row', gap: 8 },
  statPill: { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#f9fafb' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#f9fafb', marginBottom: 12 },
  loadingText: { color: '#6b7280', textAlign: 'center', padding: 24 },
});
