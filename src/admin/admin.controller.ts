import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────
  @Get('stats')
  getStats() { return this.adminService.getStats(); }

  // ── Posts suspensos ────────────────────────────────────────────────────────
  @Get('posts/suspended')
  getSuspendedPosts() { return this.adminService.getSuspendedPosts(); }

  @Get('reports/all')
  getAllReports() { return this.adminService.getAllReports(); }

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

  // ── Gestão de admins ───────────────────────────────────────────────────────
  @Get('admins')
  getAdmins() { return this.adminService.getAdmins(); }

  @Post('admins')
  createAdmin(@Body() body: { name: string; email: string; password: string }) {
    return this.adminService.createAdmin(body);
  }

  @Delete('admins/:adminId')
  deleteAdmin(@Req() req: any, @Param('adminId') adminId: string) {
    return this.adminService.deleteAdmin(req.user.profile_id, adminId);
  }

  // ── Configurações do próprio admin ─────────────────────────────────────────
  @Patch('me/credentials')
  updateMyCredentials(
    @Req() req: any,
    @Body() body: { email?: string; password?: string; current_password: string },
  ) {
    return this.adminService.updateMyCredentials(req.user.profile_id, body);
  }
}
