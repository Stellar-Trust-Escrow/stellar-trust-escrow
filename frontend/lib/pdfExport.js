/**
 * pdfExport — client-side escrow receipt PDF generation.
 *
 * Renders a complete, portable, verifiable record of a completed/resolved
 * escrow (parties, milestone history, dispute resolution, QR code linking to
 * the on-chain record) entirely in the browser using pdf-lib. No server
 * round-trip is involved.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_TEXT = rgb(0.1, 0.1, 0.15);
const COLOR_MUTED = rgb(0.45, 0.45, 0.5);
const COLOR_BRAND = rgb(0.31, 0.27, 0.9); // indigo-600
const COLOR_RULE = rgb(0.85, 0.85, 0.88);

/**
 * 48x48 "Trustchain Escrow" mark, pre-rasterized from the product's SVG
 * shield logo to PNG bytes (pdf-lib can only embed raster images, not SVG).
 */
const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAlElEQVR4nO3Yuw3AMAwDUU/nNvsPkDniPpU/pJgAZ0C17pVWu/r9/HlaOgBAOgBAOgBAOqAMkHgAAAAAAAAAAAAAAAAAIAFUI2ablr+UX4rfArgRqy1Hn/pkuASgQpzsl5xVUvEywC5CsVd62KqOlwNmIOpdttNiRbwV8Ea4dtiPu874EoB7AKQHQHoApAdAegYikibAvAvekwAAAABJRU5ErkJggg==';

function base64ToBytes(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node / Jest environment
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** Resolve the Stellar Expert base URL for the given network. */
function explorerBase(network = 'testnet') {
  return network === 'mainnet'
    ? 'https://stellar.expert/explorer/public'
    : 'https://stellar.expert/explorer/testnet';
}

export function getAccountExplorerUrl(address, network = 'testnet') {
  return `${explorerBase(network)}/account/${address}`;
}

export function getTxExplorerUrl(txHash, network = 'testnet') {
  return `${explorerBase(network)}/tx/${txHash}`;
}

export function getContractExplorerUrl(contractId, network = 'testnet') {
  return `${explorerBase(network)}/contract/${contractId}`;
}

/**
 * Normalizes the parties involved in an escrow into rows for the receipt's
 * parties table. Arbiter is only included when the escrow was disputed or
 * resolved and an arbiter address is present.
 */
export function buildPartyRows(escrow, network = 'testnet') {
  const rows = [
    {
      role: 'Client',
      address: escrow.clientAddress || '—',
      url: escrow.clientAddress ? getAccountExplorerUrl(escrow.clientAddress, network) : null,
    },
    {
      role: 'Contractor',
      address: escrow.freelancerAddress || escrow.contractorAddress || '—',
      url:
        escrow.freelancerAddress || escrow.contractorAddress
          ? getAccountExplorerUrl(escrow.freelancerAddress || escrow.contractorAddress, network)
          : null,
    },
  ];

  const isDisputeRelated = escrow.status === 'Disputed' || escrow.status === 'Resolved';
  if (isDisputeRelated && escrow.arbiterAddress) {
    rows.push({
      role: 'Arbiter',
      address: escrow.arbiterAddress,
      url: getAccountExplorerUrl(escrow.arbiterAddress, network),
    });
  }

  return rows;
}

/**
 * Normalizes an escrow's milestones into rows for the receipt's milestone
 * table: index, description, amount, status, deliverable hash, tx hash.
 */
export function buildMilestoneRows(milestones = []) {
  return milestones.map((milestone, index) => ({
    index: index + 1,
    description: milestone.title || milestone.description || `Milestone ${index + 1}`,
    amount: milestone.amount ?? '—',
    status: milestone.status || '—',
    deliverableHash: milestone.deliverableHash || milestone.ipfsHash || '—',
    txHash: milestone.txHash || milestone.transactionHash || '—',
  }));
}

function truncateForCell(value, maxChars) {
  const str = String(value ?? '—');
  if (str.length <= maxChars) return str;
  return `${str.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Generates the escrow receipt PDF for a completed or resolved escrow.
 *
 * @param {object} escrow — escrow record (see fields used below)
 * @param {object} [options]
 * @param {'mainnet'|'testnet'} [options.network='testnet']
 * @param {Date}   [options.timestamp] — export timestamp (defaults to now)
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function generateEscrowReceiptPdf(escrow, options = {}) {
  const network = options.network || 'testnet';
  const timestamp = options.timestamp || new Date();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await pdfDoc.embedPng(base64ToBytes(LOGO_PNG_BASE64));

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawText = (text, { x = MARGIN, size = 10, color = COLOR_TEXT, useFont = font } = {}) => {
    page.drawText(String(text), { x, y, size, font: useFont, color });
  };

  const drawRule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: COLOR_RULE,
    });
  };

  // ── Header ────────────────────────────────────────────────────────────
  const logoSize = 32;
  page.drawImage(logoImage, {
    x: MARGIN,
    y: y - logoSize + 6,
    width: logoSize,
    height: logoSize,
  });
  page.drawText('Trustchain Escrow', {
    x: MARGIN + logoSize + 12,
    y: y - 10,
    size: 16,
    font: boldFont,
    color: COLOR_BRAND,
  });
  page.drawText('Escrow Completion Receipt', {
    x: MARGIN + logoSize + 12,
    y: y - 26,
    size: 10,
    font,
    color: COLOR_MUTED,
  });
  y -= logoSize + 14;
  drawRule();
  y -= 20;

  drawText(`Escrow ID: ${escrow.id ?? escrow.escrowId ?? '—'}`, { size: 11, useFont: boldFont });
  y -= 16;
  drawText(`Exported: ${timestamp.toISOString()}`, { size: 9, color: COLOR_MUTED });
  y -= 16;
  drawText(`Status: ${escrow.status ?? '—'}`, { size: 9, color: COLOR_MUTED });
  y -= 28;

  // ── Parties ───────────────────────────────────────────────────────────
  drawText('Parties', { size: 13, useFont: boldFont, color: COLOR_BRAND });
  y -= 18;

  const partyRows = buildPartyRows(escrow, network);
  for (const party of partyRows) {
    ensureSpace(28);
    drawText(party.role, { size: 9, useFont: boldFont });
    y -= 13;
    drawText(party.address, { size: 9, color: COLOR_TEXT });
    y -= 12;
    if (party.url) {
      drawText(party.url, { size: 8, color: COLOR_BRAND });
      y -= 14;
    } else {
      y -= 2;
    }
  }
  y -= 12;

  // ── Milestones ────────────────────────────────────────────────────────
  ensureSpace(60);
  drawText('Milestones', { size: 13, useFont: boldFont, color: COLOR_BRAND });
  y -= 18;

  const columns = [
    { key: 'index', label: '#', x: MARGIN, width: 20 },
    { key: 'description', label: 'Description', x: MARGIN + 22, width: 130 },
    { key: 'amount', label: 'Amount', x: MARGIN + 155, width: 60 },
    { key: 'status', label: 'Status', x: MARGIN + 218, width: 55 },
    { key: 'deliverableHash', label: 'Deliverable Hash', x: MARGIN + 276, width: 110 },
    { key: 'txHash', label: 'Tx Hash', x: MARGIN + 389, width: 123 },
  ];

  const drawTableHeader = () => {
    for (const col of columns) {
      page.drawText(col.label, { x: col.x, y, size: 8, font: boldFont, color: COLOR_MUTED });
    }
    y -= 12;
    drawRule();
    y -= 10;
  };

  ensureSpace(30);
  drawTableHeader();

  const milestoneRows = buildMilestoneRows(escrow.milestones);
  for (const row of milestoneRows) {
    ensureSpace(16);
    for (const col of columns) {
      const raw = row[col.key];
      const maxChars = col.key === 'description' ? 24 : col.key.endsWith('Hash') ? 20 : 12;
      page.drawText(truncateForCell(raw, maxChars), {
        x: col.x,
        y,
        size: 8,
        font,
        color: COLOR_TEXT,
      });
    }
    y -= 16;
  }
  y -= 12;

  // ── Resolution (dispute outcome) ─────────────────────────────────────
  const isDisputeRelated = escrow.status === 'Disputed' || escrow.status === 'Resolved';
  if (isDisputeRelated && escrow.resolution) {
    ensureSpace(90);
    drawText('Resolution', { size: 13, useFont: boldFont, color: COLOR_BRAND });
    y -= 18;

    const { ruling, clientSplitPercent, contractorSplitPercent, rulingTxHash } = escrow.resolution;
    drawText(`Ruling: ${ruling ?? '—'}`, { size: 9 });
    y -= 14;
    drawText(
      `Split: ${clientSplitPercent ?? '—'}% client / ${contractorSplitPercent ?? '—'}% contractor`,
      { size: 9 },
    );
    y -= 14;
    drawText(`Arbiter ruling tx: ${rulingTxHash ?? '—'}`, { size: 9 });
    y -= 12;
    if (rulingTxHash) {
      drawText(getTxExplorerUrl(rulingTxHash, network), { size: 8, color: COLOR_BRAND });
      y -= 14;
    }
    y -= 8;
  }

  // ── QR code + digital signature line (last page) ─────────────────────
  const contractId = escrow.contractAddress || escrow.contractId;
  const verifyUrl = contractId
    ? getContractExplorerUrl(contractId, network)
    : getAccountExplorerUrl(escrow.clientAddress || '', network);

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 });
  const qrBase64 = qrDataUrl.split(',')[1];
  const qrImage = await pdfDoc.embedPng(base64ToBytes(qrBase64));

  const qrSize = 120;
  ensureSpace(qrSize + 60);
  drawText('Verify on-chain', { size: 11, useFont: boldFont, color: COLOR_BRAND });
  y -= 14;
  page.drawImage(qrImage, { x: MARGIN, y: y - qrSize, width: qrSize, height: qrSize });
  page.drawText(verifyUrl, {
    x: MARGIN + qrSize + 16,
    y: y - qrSize / 2,
    size: 9,
    font,
    color: COLOR_TEXT,
    maxWidth: CONTENT_WIDTH - qrSize - 16,
  });
  y -= qrSize + 20;

  ensureSpace(40);
  drawRule();
  y -= 16;
  const signatureLine = `This receipt was generated at ${timestamp.toISOString()} and reflects on-chain state. Verify at ${verifyUrl}.`;
  page.drawText(signatureLine, {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: COLOR_MUTED,
    maxWidth: CONTENT_WIDTH,
    lineHeight: 10,
  });

  return pdfDoc.save();
}

/**
 * Triggers a browser download of the given PDF bytes via a temporary
 * `<a download>` link — no server round-trip.
 */
export function downloadReceiptPdf(bytes, escrowId) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `receipt-${escrowId}.pdf`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
