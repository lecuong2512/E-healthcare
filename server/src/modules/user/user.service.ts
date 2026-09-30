import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolve, extname, join } from 'node:path';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { UserEntity } from '../../database/entities/user.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { Role } from '@shared/enums';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

@Injectable()
export class UserService {
  constructor(private readonly dataSource: DataSource) {}

  async uploadAvatar(
    requesterUserId: string,
    requesterRole: Role,
    file?: MulterFile,
    targetUserId?: string,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh để tải lên.');
    }

    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Kích thước ảnh không được vượt quá 2MB.');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException(
        'Định dạng ảnh không hợp lệ. Chỉ chấp nhận các định dạng PNG, JPG, JPEG, WEBP.',
      );
    }

    let targetId = requesterUserId;
    if (targetUserId && targetUserId !== requesterUserId) {
      if (requesterRole !== Role.ADMIN) {
        throw new ForbiddenException(
          'Chỉ quản trị viên mới có quyền cập nhật ảnh đại diện của người khác.',
        );
      }
      targetId = targetUserId;
    }

    const userRepo = this.dataSource.getRepository(UserEntity);
    const user = await userRepo.findOneBy({ id: targetId });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    // Ensure upload directory exists
    const uploadsDir = resolve(process.cwd(), 'uploads', 'avatars');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const rawExt = extname(file.originalname).toLowerCase();
    const ext = rawExt && ['.png', '.jpg', '.jpeg', '.webp'].includes(rawExt)
      ? rawExt
      : file.mimetype.includes('png')
        ? '.png'
        : file.mimetype.includes('webp')
          ? '.webp'
          : '.jpg';

    const filename = `avatar-${targetId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = join(uploadsDir, filename);

    await fs.writeFile(filePath, file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    user.avatarUrl = avatarUrl;
    await userRepo.save(user);

    // If user is also a doctor, update doctor's avatar_url as well
    const doctorRepo = this.dataSource.getRepository(DoctorEntity);
    const doctor = await doctorRepo.findOneBy({ userId: targetId });
    if (doctor) {
      doctor.avatarUrl = avatarUrl;
      await doctorRepo.save(doctor);
    }

    return { avatarUrl };
  }
}
