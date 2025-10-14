import { Controller, Post, UseGuards, Req, Delete, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { ProfileImageService } from './profile-image.service';

interface AuthenticatedRequest extends FastifyRequest {
  user: { profile_id: string }; // ⚡ precisa bater com o que o guard retorna
}

@Controller('profile-image')
export class ProfileImageController {
  constructor(private readonly profileImageService: ProfileImageService) {}

  @UseGuards(AuthGuard)
  @Post('upload')
  async uploadProfileImage(@Req() req: AuthenticatedRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const buffer = await data.toBuffer();
    const profileId = req.user.profile_id; // 🔹 pega do guard

    return this.profileImageService.uploadProfileImage(
      profileId,
      buffer,
      data.mimetype,
    );
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteProfileImage(@Req() req: AuthenticatedRequest) {
    const profileId = req.user.profile_id;
    return this.profileImageService.deleteProfileImage(profileId);
  }
}
