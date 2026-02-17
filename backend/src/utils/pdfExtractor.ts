// Helper para extraer texto de PDFs usando pdfjs-dist
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Extraer texto de un buffer de PDF
 */
export async function extractTextFromPDF(dataBuffer: Buffer): Promise<string> {
  try {
    const data = new Uint8Array(dataBuffer);
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error: any) {
    throw new Error(`Error al extraer texto del PDF: ${error.message}`);
  }
}
