import ErrorBoundary from '@/components/ErrorBoundary'

export default function EscrowsListPage() {
  return (
    <ErrorBoundary context="escrow-list">
      <div>Escrows List Page</div>
    </ErrorBoundary>
  )
}