import html2canvas from 'html2canvas';

export async function exportToImage(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2, // 고해상도
    backgroundColor: '#ffffff',
    logging: false,
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
