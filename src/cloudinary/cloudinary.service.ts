import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf'];
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

  async deleteFile(
    publicId: string,
    options?: { resource_type?: 'image' | 'video' | 'raw' },
  ): Promise<void> {
    if (!publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, options);
    } catch (err) {
      console.warn('Failed to delete Cloudinary file:', publicId, err);
    }
  }

  async deleteByUrl(fileUrl: string): Promise<void> {
    if (!fileUrl || typeof fileUrl !== 'string') return;
    if (!fileUrl.includes('cloudinary.com')) return;

    try {
      // Find upload segment
      const uploadIdx = fileUrl.indexOf('/upload/');
      if (uploadIdx === -1) return;

      const preUpload = fileUrl.substring(0, uploadIdx);
      const postUpload = fileUrl.substring(uploadIdx + 8); // after "/upload/"

      // Determine resource_type from preUpload path (e.g. /video/upload or /image/upload or /raw/upload)
      let resourceType: 'image' | 'video' | 'raw' = 'image';
      if (preUpload.includes('/video')) {
        resourceType = 'video';
      } else if (preUpload.includes('/raw')) {
        resourceType = 'raw';
      }

      // Remove version (e.g. "v1789023412/") if present
      const cleanPath = postUpload.replace(/^v\d+\//, '');

      // For raw files, publicId includes extension. For image/video, publicId excludes extension.
      let publicId = cleanPath;
      if (resourceType !== 'raw') {
        const lastDot = cleanPath.lastIndexOf('.');
        if (lastDot > 0) {
          publicId = cleanPath.substring(0, lastDot);
        }
      }

      await this.deleteFile(publicId, { resource_type: resourceType });
    } catch (err) {
      console.warn('Error deleting Cloudinary asset by URL:', fileUrl, err);
    }
  }
}
