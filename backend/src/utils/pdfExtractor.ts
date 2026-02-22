/**
 * Convertir un buffer de PDF a string base64 para envío directo a OpenAI Vision API
 */
export function convertPdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64');
}

// ============================================
// FALLBACK: Extracción de texto con pdfjs-dist
// Mantener comentado por si se necesita volver al enfoque de texto plano
// ============================================
// const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
//
// export async function extractTextFromPDF(dataBuffer: Buffer): Promise<string> {
//   try {
//     const data = new Uint8Array(dataBuffer);
//     const pdf = await pdfjsLib.getDocument({ data }).promise;
//
//     let fullText = '';
//
//     for (let i = 1; i <= pdf.numPages; i++) {
//       const page = await pdf.getPage(i);
//       const textContent = await page.getTextContent();
//       const pageText = textContent.items.map((item: any) => item.str).join(' ');
//       fullText += pageText + '\n';
//     }
//
//     return fullText;
//   } catch (error: any) {
//     throw new Error(`Error al extraer texto del PDF: ${error.message}`);
//   }
// }
