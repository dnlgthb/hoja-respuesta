// Cliente de Supabase Storage - Para subir PDFs
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Crear cliente de Supabase — prefer service key (bypasses RLS) over anon key
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
const supabase = createClient(env.SUPABASE_URL, supabaseKey);

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
/**
 * Upload an image buffer to Supabase Storage
 * @param buffer - Image data as Buffer
 * @param filePath - Path within the bucket (e.g., 'images/test-123/hash.jpg')
 * @param contentType - MIME type (default: 'image/jpeg')
 * @returns Public URL of the uploaded image
 */
export async function uploadImage(buffer: Buffer, filePath: string, contentType: string = 'image/jpeg'): Promise<string> {
  // Try upsert first; if RLS blocks it (file already exists with different content type),
  // delete the old file and retry as a fresh insert.
  let { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error?.message?.includes('row-level security')) {
    // RLS upsert blocked — delete existing file and retry
    await supabase.storage.from(BUCKET_NAME).remove([filePath]);
    const retry = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, { contentType, upsert: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`Error al subir imagen: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data!.path);

  return urlData.publicUrl;
}

export async function deletePDF(fileName: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fileName]);

  if (error) {
    throw new Error(`Error al eliminar PDF: ${error.message}`);
  }
}

export default supabase;
