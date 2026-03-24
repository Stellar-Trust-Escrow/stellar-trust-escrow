function milestoneCompletedTemplate({ escrowId, milestoneIndex, milestoneTitle, dashboardUrl }) {
  return ({ recipient, unsubscribeUrl, fromName }) => ({
    subject: `Milestone ${milestoneIndex} completed for escrow #${escrowId}`,
    text: [
      `Hello ${recipient.name || recipient.address || 'there'},`,
      '',
      `Milestone ${milestoneIndex}${milestoneTitle ? ` (${milestoneTitle})` : ''} was completed for escrow #${escrowId}.`,
      `View escrow progress here: ${dashboardUrl}`,
      '',
      `Unsubscribe: ${unsubscribeUrl}`,
      '',
      `- ${fromName}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2>Milestone completed</h2>
        <p>Hello ${recipient.name || recipient.address || 'there'},</p>
        <p>
          Milestone <strong>${milestoneIndex}</strong>${milestoneTitle ? ` (${milestoneTitle})` : ''}
          was completed for escrow <strong>#${escrowId}</strong>.
        </p>
        <p><a href="${dashboardUrl}">View escrow progress</a></p>
        <p style="font-size: 12px; color: #6b7280;">Need fewer emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>
      </div>
    `,
  });
}

export default milestoneCompletedTemplate;
