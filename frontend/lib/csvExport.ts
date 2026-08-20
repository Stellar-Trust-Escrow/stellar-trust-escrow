export function exportToCSV(data: unknown[], filename: string) {
  if (!data || !data.length) return;

  const keys = Object.keys(data[0] as Record<string, unknown>);
  const csvContent = [
    keys.join(','),
    ...data.map(row => keys.map(k => {
      let val = (row as Record<string, unknown>)[k];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
      return val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
