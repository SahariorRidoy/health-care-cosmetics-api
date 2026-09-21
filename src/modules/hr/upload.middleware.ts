import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from '../../common/utils/errors';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'employees');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const field = file.fieldname; // 'cv' or 'nid'
    const empId = req.params.id;
    cb(null, `${empId}-${field}${ext}`);
  },
});

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Only PDF, JPG, and PNG files are allowed', 400));
  }
}

export const uploadEmployeeDocs = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'nid', maxCount: 1 },
]);
