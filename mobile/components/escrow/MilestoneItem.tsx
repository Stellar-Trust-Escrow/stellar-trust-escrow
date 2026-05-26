import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Badge from '../ui/Badge';
import { stroopsToXlm } from '../../lib/stellar';
import type { Milestone } from '../../lib/api';

interface MilestoneItemProps {
  milestone: Milestone;
  index: number;
}

export default function MilestoneItem({ milestone, index }: MilestoneItemProps) {
  return (
    <View style={styles.container}>
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {milestone.title}
          </Text>
          <Badge status={milestone.status} size="sm" />
        </View>
        <Text style={styles.amount}>{stroopsToXlm(milestone.amount)} XLM</Text>
        {milestone.submittedAt && (
          <Text style={styles.meta}>
            Submitted {new Date(milestone.submittedAt).toLocaleDateString()}
          </Text>
        )}
        {milestone.resolvedAt && (
          <Text style={styles.meta}>
            Resolved {new Date(milestone.resolvedAt).toLocaleDateString()}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  indexText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  content: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '600', color: '#e5e7eb', flex: 1, marginRight: 8 },
  amount: { fontSize: 13, color: '#9ca3af' },
  meta: { fontSize: 11, color: '#4b5563', marginTop: 2 },
});
