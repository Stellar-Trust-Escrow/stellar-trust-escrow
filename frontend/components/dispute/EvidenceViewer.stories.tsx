import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import EvidenceViewer from './EvidenceViewer';

// Inline SVG data-URI so the image preview renders deterministically in
// Storybook and on Chromatic without depending on external asset hosts.
const IMAGE_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280">' +
      '<rect width="100%" height="100%" fill="#1f2937"/>' +
      '<text x="50%" y="50%" fill="#9ca3af" font-family="sans-serif" font-size="18" ' +
      'text-anchor="middle" dominant-baseline="middle">Evidence preview</text></svg>',
  );

/**
 * `EvidenceViewer` previews dispute / escrow evidence (images or PDFs) with
 * explicit loading, loaded, and gateway-error states. Stories cover every
 * required variant.
 */
const meta: Meta<typeof EvidenceViewer> = {
  title: 'Dispute/EvidenceViewer',
  component: EvidenceViewer,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    type: { control: 'select', options: ['pdf', 'image'], description: 'Evidence kind' },
    state: {
      control: 'select',
      options: ['loading', 'loaded', 'error'],
      description: 'Load lifecycle state',
    },
    fileName: { control: 'text', description: 'File name shown in the header' },
    gateway: { control: 'text', description: 'Gateway shown in the error variant' },
    onRetry: { action: 'retry', description: 'Retry clicked' },
    onDownload: { action: 'download', description: 'Download clicked' },
  },
  args: {
    type: 'image',
    state: 'loaded',
    fileName: 'delivery-proof.png',
    onRetry: fn(),
    onDownload: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof EvidenceViewer>;

export const PdfLoading: Story = {
  args: { type: 'pdf', state: 'loading', fileName: 'contract-amendment.pdf' },
};

export const PdfLoaded: Story = {
  args: {
    type: 'pdf',
    state: 'loaded',
    fileName: 'contract-amendment.pdf',
    url: 'https://example.com/contract-amendment.pdf',
  },
};

export const ImageLoaded: Story = {
  args: {
    type: 'image',
    state: 'loaded',
    fileName: 'delivery-proof.png',
    url: IMAGE_DATA_URI,
  },
};

export const GatewayError: Story = {
  args: {
    type: 'image',
    state: 'error',
    fileName: 'delivery-proof.png',
    gateway: 'ipfs.io',
  },
};
