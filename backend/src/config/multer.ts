// Configuración de Multer - Manejo de uploads de archivos
import multer from 'multer';

// Configurar Multer para guardar archivos en memoria (Buffer)
const storage = multer.memoryStorage();

// Filtro: solo archivos PDF
const pdfFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false);
  }
};

// Filtro: archivos Excel y CSV
const spreadsheetFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
    'application/csv', // .csv alternativo
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)'), false);
  }
};

// Multer para PDFs
export const upload = multer({
  storage: storage,
  fileFilter: pdfFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Máximo 10MB
  },
});

// Filtro: imágenes
const imageFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen'), false);
  }
};

// Multer para imágenes
export const uploadImage = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5MB
  },
});

// Multer para Excel/CSV
export const uploadSpreadsheet = multer({
  storage: storage,
  fileFilter: spreadsheetFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5MB
  },
});
