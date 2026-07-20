/**
 * ExportReceiptButton Component
 *
 * Generates and downloads a client-side PDF receipt for a completed or
 * resolved escrow — parties, milestone history, resolution (if disputed),
 * and a QR code linking to the on-chain record. No server round-trip.
 *
 * Only rendered when the escrow is `Completed` or `Resolved`.
 *
 * @param {object} props
 * @param {object} props.escrow — escrow record (see lib/pdfExport.js)
 * @param {'mainnet'|'testnet'} [props.network]
 */

'use client';

import { useState } from 'react';
import Button from '../ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { generateEscrowReceiptPdf, downloadReceiptPdf } from '../../lib/pdfExport';

const EXPORTABLE_STATUSES = ['Completed', 'Resolved'];

export default function ExportReceiptButton({ escrow, network }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const { showToast } = useToast();

  if (!escrow || !EXPORTABLE_STATUSES.includes(escrow.status)) {
    return null;
  }

  const escrowId = escrow.id ?? escrow.escrowId;

  const handleExport = async () => {
    setIsGenerating(true);
    setStatusMessage('Generating receipt…');
    try {
      const resolvedNetwork = network || process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
      const bytes = await generateEscrowReceiptPdf(escrow, { network: resolvedNetwork });
      downloadReceiptPdf(bytes, escrowId);
      setStatusMessage('Receipt downloaded');
      showToast('Receipt downloaded', 'success');
    } catch (err) {
      setStatusMessage('Failed to generate receipt');
      showToast(err.message || 'Failed to generate receipt', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExport}
        isLoading={isGenerating}
        aria-label="Export escrow receipt as PDF"
      >
        Export Receipt
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </span>
    </>
  );
}
