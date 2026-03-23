function escrowStatusChangedTemplate({ escrowId, previousStatus, status, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Escrow #${escrowId} is now ${status}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `Escrow #${escrowId} changed from ${previousStatus || 'its previous state'} to ${status}.`,
      `View the latest details here: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Escrow #${escrowId} status update</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          Escrow <strong>#${escrowId}</strong> changed from
          <strong>${previousStatus || 'its previous state'}</strong> to
          <strong>${status}</strong>.
        </p>
        <p><a href="${dashboardUrl}">Open escrow details</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default escrowStatusChangedTemplate;
