// Configuración de Multer - Manejo de uploads de archivos
import multer from 'multer';

// Configurar Multer para guardar archivos en memoria (Buffer)
const storage = multer.memoryStorage();

// Filtro: solo archivos PDF
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true); // Aceptar archivo
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false); // Rechazar archivo
  }
};

// Configurar Multer
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Máximo 10MB
  },
});
