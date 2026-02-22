import { PDFDocument } from 'pdf-lib';

/**
 * Convertir un buffer de PDF a string base64 para envío directo a OpenAI Vision API
 */
export function convertPdfToBase64(pdfBuffer: Buffer): string {
  return pdfBuffer.toString('base64');
}

/**
 * Obtener el número de páginas de un PDF
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

/**
 * Dividir un PDF en chunks de N páginas y retornar cada chunk como base64
 * @param pdfBuffer - Buffer del PDF original
 * @param pagesPerChunk - Cantidad de páginas por chunk (default: 15)
 * @returns Array de { base64, startPage, endPage, totalPages }
 */
export async function splitPdfIntoChunks(
  pdfBuffer: Buffer,
  pagesPerChunk: number = 15
): Promise<Array<{ base64: string; startPage: number; endPage: number; totalPages: number }>> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();

  // Si cabe en un solo chunk, retornar el PDF completo
  if (totalPages <= pagesPerChunk) {
    return [{
      base64: pdfBuffer.toString('base64'),
      startPage: 1,
      endPage: totalPages,
      totalPages,
    }];
  }

  const chunks: Array<{ base64: string; startPage: number; endPage: number; totalPages: number }> = [];

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);

    // Crear un nuevo PDF con solo las páginas de este chunk
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices);

    for (const page of copiedPages) {
      chunkDoc.addPage(page);
    }

    const chunkBytes = await chunkDoc.save();
    const chunkBase64 = Buffer.from(chunkBytes).toString('base64');

    chunks.push({
      base64: chunkBase64,
      startPage: start + 1,
      endPage: end,
      totalPages,
    });
  }

  return chunks;
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
