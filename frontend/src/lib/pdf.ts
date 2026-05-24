export function openPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  // Must be full-size for Chrome to render the PDF plugin; opacity:0 hides it from the user
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;opacity:0;pointer-events:none;border:none;z-index:-1;';
  iframe.addEventListener('load', () => {
    // Short delay lets Chrome's PDF renderer finish before print dialog opens
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60_000);
    }, 500);
  });
  iframe.src = url;
  document.body.appendChild(iframe);
}
