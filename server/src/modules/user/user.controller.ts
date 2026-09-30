import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
  Body,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest } from '../../common/guards/authenticated-request';
import { UserService, MulterFile } from './user.service';
import { Roles } from '../../common/decorators/auth.decorators';
import { Role } from '@shared/enums';

@Controller('users')
@Roles(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('avatar')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: MulterFile | undefined,
    @Req() req: AuthenticatedRequest,
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
  ): Promise<{ avatarUrl: string }> {
    const targetUserId = bodyUserId || queryUserId;
    return this.userService.uploadAvatar(
      req.auth!.userId,
      req.auth!.role,
      file,
      targetUserId,
    );
  }
}
