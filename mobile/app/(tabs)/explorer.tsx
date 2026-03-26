/**
 * Explorer Tab — search all escrows on the platform.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { escrowApi, type Escrow } from '../../lib/api';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { truncateAddress, stroopsToXlm } from '../../lib/stellar';
import { useDebounce } from '../../hooks/useDebounce';

export default function ExplorerScreen() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['explorer', debouncedQuery, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 30 };
      if (debouncedQuery) params.search = debouncedQuery;
      if (statusFilter) params.status = statusFilter;
      const { data } = await escrowApi.list(params);
      return data;
    },
    staleTime: 20_000,
  });

  const escrows: Escrow[] = data?.data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Escrow }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => void router.push(`/escrow/${item.id}`)}
      >
        <View style={styles.rowLeft}>
          <Text style={styles.rowId}>#{item.id}</Text>
          <Text style={styles.rowAddress} numberOfLines={1}>
            {truncateAddress(item.clientAddress)} → {truncateAddress(item.freelancerAddress)}
          </Text>
          <Text style={styles.rowAmount}>{stroopsToXlm(item.totalAmount)} XLM</Text>
        </View>
        <Badge status={item.status} size="sm" />
      </TouchableOpacity>
    ),
    [router],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by ID or address…"
          placeholderTextColor="#4b5563"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status chips */}
      <View style={styles.chips}>
        {['', 'Active', 'Completed', 'Disputed', 'Cancelled'].map((s) => (
          <TouchableOpacity
            key={s || 'all'}
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
              {s || 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={escrows}
        keyExtractor={(e: Escrow) => String(e.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#6366f1" />}
        renderItem={renderItem}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState icon="🔍" title="No results" subtitle="Try a different search term" />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  searchContainer: { padding: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#f9fafb',
  },
  chips: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151' },
  chipActive: { backgroundColor: '#4338ca', borderColor: '#6366f1' },
  chipText: { fontSize: 12, color: '#9ca3af' },
  chipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  rowLeft: { flex: 1, marginRight: 10 },
  rowId: { fontSize: 13, fontWeight: '700', color: '#f9fafb' },
  rowAddress: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#a5b4fc', marginTop: 4 },
});
