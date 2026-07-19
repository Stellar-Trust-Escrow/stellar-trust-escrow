/**
 * Escrow template mapping helpers.
 *
 * The backend stores wizard state as `templateData` JSON:
 *   { version: 1, escrow: { tokenAddress, totalAmount, deadline, briefHash },
 *     milestones: [{ title, amount }], settings: { arbiterAddress? } }
 *
 * The create-escrow wizard keeps a flatter `formData` shape, so these helpers
 * convert between the two.
 */

const EMPTY_MILESTONE = { title: '', description: '', amount: '' };

/** Build the backend `templateData` payload from the wizard `formData`. */
export function buildTemplateDataFromForm(formData = {}) {
  return {
    version: 1,
    escrow: {
      tokenAddress: formData.tokenAddress || 'usdc',
      totalAmount: formData.totalAmount || '',
      deadline: formData.deadline || null,
      briefHash: formData.briefDescription || null,
    },
    milestones: Array.isArray(formData.milestones)
      ? formData.milestones.map((milestone) => ({
          title: milestone.title || '',
          amount: milestone.amount || '',
        }))
      : [],
    settings: { arbiterAddress: undefined },
  };
}

/** Apply a backend template onto the wizard `formData`. */
export function applyBackendTemplateToForm(currentForm = {}, template = {}) {
  const data = template?.templateData || {};
  const escrow = data.escrow || {};

  const milestones =
    Array.isArray(data.milestones) && data.milestones.length > 0
      ? data.milestones.map((milestone) => ({
          title: milestone.title || '',
          description: '',
          amount: milestone.amount || '',
        }))
      : [{ ...EMPTY_MILESTONE }];

  return {
    ...currentForm,
    tokenAddress: escrow.tokenAddress || currentForm.tokenAddress || 'usdc',
    totalAmount: escrow.totalAmount || '',
    deadline: escrow.deadline || '',
    briefDescription: escrow.briefHash || '',
    milestones,
  };
}
