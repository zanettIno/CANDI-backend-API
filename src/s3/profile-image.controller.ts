import { Controller, Post, UseGuards, Req, Delete, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { ProfileImageService } from './profile-image.service';

interface AuthenticatedRequest extends FastifyRequest {
  user: { profile_id: string };
}

@Controller('profile-image')
export class ProfileImageController {
  constructor(private readonly profileImageService: ProfileImageService) {}

  @UseGuards(AuthGuard)
  @Post('upload')
  async uploadProfileImage(@Req() req: AuthenticatedRequest) {
    const body = req.body as any;
    const fileField = body?.file;

    if (!fileField?._buf) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const buffer = Buffer.from(fileField._buf);
    const mimetype = fileField.mimetype || 'image/jpeg';
    const profileId = req.user.profile_id;

    return this.profileImageService.uploadProfileImage(profileId, buffer, mimetype);
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteProfileImage(@Req() req: AuthenticatedRequest) {
    const profileId = req.user.profile_id;
    return this.profileImageService.deleteProfileImage(profileId);
  }
}
