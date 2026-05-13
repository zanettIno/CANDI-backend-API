import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CommunityService } from './community.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/community.dto';

interface AuthReq {
  user: {
    profile_id: string;
    profile_name: string;
    profile_email: string;
    profile_nickname: string;
  };
}

@Controller('community')
@UseGuards(AuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ─── GRUPOS ────────────────────────────────────────────────────────────────

  @Post('groups')
  createGroup(@Req() req: AuthReq, @Body() dto: CreateGroupDto) {
    return this.communityService.createGroup(req.user, dto);
  }

  @Get('groups')
  listGroups(@Query('topic') topic?: string) {
    return this.communityService.listGroups(topic);
  }

  @Get('groups/mine')
  getMyGroups(@Req() req: AuthReq) {
    return this.communityService.getMyGroups(req.user.profile_id);
  }

  @Get('groups/:groupId')
  getGroup(@Param('groupId') groupId: string) {
    return this.communityService.getGroup(groupId);
  }

  @Patch('groups/:groupId')
  updateGroup(@Req() req: AuthReq, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.communityService.updateGroup(req.user, groupId, dto);
  }

  @Delete('groups/:groupId')
  deleteGroup(@Req() req: AuthReq, @Param('groupId') groupId: string) {
    return this.communityService.deleteGroup(req.user, groupId);
  }

  @Post('groups/:groupId/join')
  joinGroup(@Req() req: AuthReq, @Param('groupId') groupId: string) {
    return this.communityService.joinGroup(req.user, groupId);
  }

  @Delete('groups/:groupId/leave')
  leaveGroup(@Req() req: AuthReq, @Param('groupId') groupId: string) {
    return this.communityService.leaveGroup(req.user, groupId);
  }

  @Get('groups/:groupId/members')
  getGroupMembers(@Param('groupId') groupId: string) {
    return this.communityService.getGroupMembers(groupId);
  }

  @Get('groups/:groupId/my-status')
  getMyStatus(@Req() req: AuthReq, @Param('groupId') groupId: string) {
    return this.communityService.getMyMemberStatus(req.user.profile_id, groupId);
  }

  @Get('groups/:groupId/requests')
  getPendingRequests(@Req() req: AuthReq, @Param('groupId') groupId: string) {
    return this.communityService.getPendingRequests(req.user, groupId);
  }

  @Post('groups/:groupId/requests/:profileId')
  handleRequest(
    @Req() req: AuthReq,
    @Param('groupId') groupId: string,
    @Param('profileId') profileId: string,
    @Body() body: { action: 'approve' | 'reject' },
  ) {
    return this.communityService.handleJoinRequest(req.user, groupId, profileId, body.action);
  }

  @Delete('groups/:groupId/members/:profileId')
  removeMember(
    @Req() req: AuthReq,
    @Param('groupId') groupId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.communityService.removeMember(req.user, groupId, profileId);
  }

  @Post('groups/:groupId/members/:profileId/role')
  updateMemberRole(
    @Req() req: AuthReq,
    @Param('groupId') groupId: string,
    @Param('profileId') profileId: string,
    @Body() body: { role: 'co-leader' | 'member' },
  ) {
    return this.communityService.updateMemberRole(req.user, groupId, profileId, body.role);
  }

  @Delete('groups/:groupId/posts/:postId')
  deleteGroupPost(
    @Req() req: AuthReq,
    @Param('groupId') groupId: string,
    @Param('postId') postId: string,
  ) {
    return this.communityService.deleteGroupPost(req.user, groupId, postId);
  }

  // ─── LIKES ──────────────────────────────────────────────────────────────────

  @Post('posts/:postId/like')
  toggleLike(@Req() req: AuthReq, @Param('postId') postId: string) {
    return this.communityService.toggleLike(req.user, postId);
  }

  @Get('posts/:postId/likes')
  getPostLikes(@Param('postId') postId: string) {
    return this.communityService.getPostLikes(postId);
  }

  @Get('me/liked-posts')
  getUserLikedPosts(@Req() req: AuthReq) {
    return this.communityService.getUserLikedPosts(req.user.profile_id);
  }

  // ─── FAVORITOS ──────────────────────────────────────────────────────────────

  @Post('posts/:postId/favorite')
  toggleFavorite(@Req() req: AuthReq, @Param('postId') postId: string) {
    return this.communityService.toggleFavorite(req.user, postId);
  }

  @Get('me/favorites')
  getMyFavorites(@Req() req: AuthReq) {
    return this.communityService.getMyFavorites(req.user.profile_id);
  }

  @Get('me/favorited-posts')
  getMyFavoritedPosts(@Req() req: AuthReq) {
    return this.communityService.getMyFavoritedPosts(req.user.profile_id);
  }

  // ─── COMENTÁRIOS ───────────────────────────────────────────────────────────

  @Post('posts/:postId/comments')
  addComment(@Req() req: AuthReq, @Param('postId') postId: string, @Body() body: { text: string }) {
    if (!body?.text?.trim()) throw new BadRequestException('Texto do comentário é obrigatório');
    return this.communityService.addComment(req.user, postId, body.text.trim());
  }

  @Get('posts/:postId/comments')
  getComments(@Param('postId') postId: string) {
    return this.communityService.getComments(postId);
  }

  @Delete('posts/:postId/comments/:commentId')
  deleteComment(
    @Req() req: AuthReq,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.communityService.deleteComment(req.user, postId, commentId);
  }

  @Delete('groups/:groupId/comments/:commentId')
  deleteGroupComment(
    @Req() req: AuthReq,
    @Param('groupId') groupId: string,
    @Param('commentId') commentId: string,
    @Query('postId') postId: string,
  ) {
    return this.communityService.deleteComment(req.user, postId, commentId, groupId);
  }

  // ─── COMPARTILHAR ───────────────────────────────────────────────────────────

  @Post('posts/:postId/share')
  sharePost(
    @Req() req: AuthReq,
    @Param('postId') postId: string,
    @Body() body: { conversationId: string },
  ) {
    return this.communityService.sharePostToConversation(req.user, postId, body.conversationId);
  }
}
