'use client';

import { useRouter } from 'next/navigation';
import Button from '../../../components/ui/Button';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import templatesData from '../../../data/templates.json';

const EMPTY_FORM_DATA = {
  freelancerAddress: '',
  tokenAddress: 'usdc',
  totalAmount: '',
  briefDescription: '',
  deadline: '',
  milestones: [{ title: '', description: '', amount: '' }],
};

export default function EscrowTemplateGalleryPage() {
  const router = useRouter();

  const handleUseTemplate = (template) => {
    router.push(`/escrow/create?template=${encodeURIComponent(template.id)}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Escrow Template Gallery</h1>
          <p className="text-gray-400 mt-1">
            Browse categorized templates and start new escrows with one click.
          </p>
        </div>
        <Button href="/escrow/create" variant="secondary">
          Back to Create Escrow
        </Button>
      </div>

      <TemplateSelector
        baseTemplates={templatesData.templates || []}
        formData={EMPTY_FORM_DATA}
        onApplyTemplate={handleUseTemplate}
        quickStartPath="/escrow/create"
      />
    </div>
  );
}
