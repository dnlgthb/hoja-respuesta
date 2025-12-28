// Cliente de Supabase Storage - Para subir PDFs
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Crear cliente de Supabase
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Nombre del bucket donde se guardarán los PDFs
const BUCKET_NAME = 'test-pdfs';

/**
 * Subir un archivo PDF a Supabase Storage
 * @param file - Buffer del archivo
 * @param fileName - Nombre del archivo (con extensión)
 * @returns URL pública del archivo
 */
export async function uploadPDF(file: Buffer, fileName: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      contentType: 'application/pdf',
      upsert: false, // No sobrescribir si ya existe
    });

  if (error) {
    throw new Error(`Error al subir PDF: ${error.message}`);
  }

  // Obtener URL pública del archivo
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * Eliminar un PDF de Supabase Storage
 * @param fileName - Nombre del archivo a eliminar
 */
export async function deletePDF(fileName: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fileName]);

  if (error) {
    throw new Error(`Error al eliminar PDF: ${error.message}`);
  }
}

export default supabase;
