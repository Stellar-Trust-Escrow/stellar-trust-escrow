/**
 * My Escrows Tab — filterable list of the user's escrows.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore } from '../../store/useWalletStore';
import { useUserEscrows } from '../../hooks/useEscrows';
import EscrowCard from '../../components/escrow/EscrowCard';
import EmptyState from '../../components/ui/EmptyState';
import type { Escrow } from '../../lib/api';

const ROLES = ['all', 'client', 'freelancer'] as const;
const STATUSES = ['All', 'Active', 'Completed', 'Disputed', 'Cancelled'] as const;

export default function EscrowsScreen() {
  const address = useWalletStore((s) => s.address)!;
  const [role, setRole] = useState<(typeof ROLES)[number]>('all');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');

  const { data, isLoading, refetch } = useUserEscrows(address, role);
  const escrows: Escrow[] = (data?.data ?? []).filter(
    (e) => status === 'All' || e.status === status,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Role filter */}
      <View style={styles.filterRow}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, role === r && styles.chipActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status filter */}
      <View style={styles.filterRow}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, status === s && styles.chipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={escrows}
        keyExtractor={(e: Escrow) => String(e.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#6366f1" />}
        renderItem={({ item }) => <EscrowCard escrow={item} userAddress={address} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState icon="📋" title="No escrows found" subtitle="Try changing the filters above" />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  chipActive: { backgroundColor: '#4338ca', borderColor: '#6366f1' },
  chipText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
});
