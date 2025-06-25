import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthRequest } from '../types/auth-request';
import { FollowService } from './follow.service';

@Controller('follow')
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  // フォローする
  @Post(':id')
  @UseGuards(JwtAuthGuard)
  async follow(@Param('id') id: string, @Req() req: AuthRequest) {
    const followerId = req.user.id;
    const followingId = parseInt(id);
    await this.followService.followUser(followerId, followingId);
    return { message: 'フォローしました' };
  }

  // フォロー解除
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async unfollow(@Param('id') id: string, @Req() req: AuthRequest) {
    const followerId = req.user.id;
    const followingId = parseInt(id);
    await this.followService.unfollow(followerId, followingId);
    return { message: 'フォローを解除しました' };
  }

  // フォローしているユーザー一覧（自分がフォローしている人）
  @Get('following/:id')
  @UseGuards(JwtAuthGuard)
  async getFollowing(@Param('id') id: string) {
    return this.followService.getFollowings(parseInt(id));
  }

  // フォロワー一覧（自分をフォローしている人）
  @Get('followers/:id')
  @UseGuards(JwtAuthGuard)
  async getFollowers(@Param('id') id: string) {
    return this.followService.getFollowers(parseInt(id));
  }

  // 特定のユーザーをフォローしているか確認
  @Get('is-following/:id')
  @UseGuards(JwtAuthGuard)
  async isFollowing(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.followService.isFollowing(req.user.id, parseInt(id));
  }
}
