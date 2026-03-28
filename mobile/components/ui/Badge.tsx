import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Active:    { bg: '#064e3b', text: '#34d399' },
  Completed: { bg: '#1e3a5f', text: '#60a5fa' },
  Disputed:  { bg: '#7c2d12', text: '#fb923c' },
  Cancelled: { bg: '#1f2937', text: '#9ca3af' },
  Pending:   { bg: '#1c1917', text: '#a8a29e' },
  Submitted: { bg: '#1e3a5f', text: '#93c5fd' },
  Approved:  { bg: '#064e3b', text: '#6ee7b7' },
  Rejected:  { bg: '#7c2d12', text: '#fca5a5' },
};

interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function Badge({ status, size = 'md' }: BadgeProps) {
  const colors = STATUS_COLORS[status] ?? { bg: '#1f2937', text: '#9ca3af' };
  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, isSmall && styles.small]}>
      <Text style={[styles.text, { color: colors.text }, isSmall && styles.smallText]}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 13, fontWeight: '600' },
  smallText: { fontSize: 11 },
});
