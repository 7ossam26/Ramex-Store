export function openPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
