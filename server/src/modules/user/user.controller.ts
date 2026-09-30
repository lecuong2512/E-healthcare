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

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('avatar')
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
