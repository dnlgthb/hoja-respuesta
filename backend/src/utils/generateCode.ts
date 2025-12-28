// Generador de códigos de acceso para pruebas
// Formato: 6 caracteres alfanuméricos en mayúsculas (ej: ABC123)

/**
 * Genera un código aleatorio de 6 caracteres
 * Caracteres permitidos: A-Z y 0-9
 * Ejemplo: "ABC123", "X7Y2K9"
 */
export function generateAccessCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

/**
 * Genera un código único verificando que no exista en la BD
 * Nota: Esto se usará en el servicio de tests
 */
export async function generateUniqueAccessCode(
  checkExists: (code: string) => Promise<boolean>
): Promise<string> {
  let code: string;
  let exists = true;
  
  // Máximo 10 intentos (muy raro que se necesiten más)
  let attempts = 0;
  const MAX_ATTEMPTS = 10;
  
  do {
    code = generateAccessCode();
    exists = await checkExists(code);
    attempts++;
    
    if (attempts >= MAX_ATTEMPTS) {
      throw new Error('No se pudo generar un código único después de 10 intentos');
    }
  } while (exists);
  
  return code;
}
