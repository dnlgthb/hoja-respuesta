// Helper para extraer texto de PDFs usando pdfjs-dist
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Extraer texto de un buffer de PDF
 * @param {Buffer} dataBuffer - Buffer del archivo PDF
 * @returns {Promise<string>} Texto extraído del PDF
 */
async function extractTextFromPDF(dataBuffer) {
  try {
    // Convertir Buffer a Uint8Array
    const data = new Uint8Array(dataBuffer);
    
    // Cargar el PDF
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    
    let fullText = '';
    
    // Extraer texto de cada página
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error) {
    throw new Error(`Error al extraer texto del PDF: ${error.message}`);
  }
}

module.exports = { extractTextFromPDF };
