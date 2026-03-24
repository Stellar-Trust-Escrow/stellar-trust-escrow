function disputeRaisedTemplate({ escrowId, raisedBy, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Dispute raised for escrow #${escrowId}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `A dispute has been raised for escrow #${escrowId}${raisedBy ? ` by ${raisedBy}` : ''}.`,
      `Review the dispute here: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Dispute raised</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          A dispute has been raised for escrow <strong>#${escrowId}</strong>${raisedBy ? ` by <strong>${raisedBy}</strong>` : ''}.
        </p>
        <p><a href="${dashboardUrl}">Review dispute details</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default disputeRaisedTemplate;
