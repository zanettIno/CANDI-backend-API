import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Posts suspensos ────────────────────────────────────────────────────────
  @Get('posts/suspended')
  getSuspendedPosts() { return this.adminService.getSuspendedPosts(); }

  @Get('posts/:postId/reports')
  getPostReports(@Param('postId') postId: string) {
    return this.adminService.getPostReports(postId);
  }

  @Patch('posts/:postId/approve')
  approvePost(@Param('postId') postId: string) {
    return this.adminService.approvePost(postId);
  }

  @Patch('posts/:postId/remove')
  removePost(@Param('postId') postId: string) {
    return this.adminService.removePost(postId);
  }

  // ── Usuários banidos ───────────────────────────────────────────────────────
  @Get('users/banned')
  getBannedUsers() { return this.adminService.getBannedUsers(); }

  @Patch('users/:userId/unban')
  unbanUser(@Param('userId') userId: string) {
    return this.adminService.unbanUser(userId);
  }
}
