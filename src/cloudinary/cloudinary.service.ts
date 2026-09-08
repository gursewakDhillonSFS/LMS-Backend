import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'application/pdf'];
const ALLOWED_MIME_EXACT = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
];
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB

@Injectable()
export class CloudinaryService {
  private assertValidFile(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds maximum size of 100MB');
    }
    const mime = file.mimetype || '';
    const allowed =
      ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
      ALLOWED_MIME_EXACT.includes(mime);
    if (!allowed) {
      throw new BadRequestException(`Unsupported file type: ${mime}`);
    }
  }

  uploadFile(
    file: Express.Multer.File,
    folder: string = 'lms',
  ): Promise<UploadApiResponse> {
    this.assertValidFile(file);
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          type: 'upload',
          access_mode: 'public',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Upload failed: no result'));
          resolve(result);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId);
  }
}
