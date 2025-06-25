import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { LikeService } from './like.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthRequest } from '../types/auth-request';
import { PrismaService } from '../prisma/prisma.service';

@Controller('likes')
export class LikeController {
  constructor(
    private readonly likeService: LikeService,
    private readonly prisma: PrismaService,
  ) {}

  // いいねを押す
  @UseGuards(JwtAuthGuard)
  @Post(':postId')
  async like(
    @Param('postId', ParseIntPipe) postId: number,
    @Req() req: AuthRequest,
  ) {
    const count = await this.likeService.like(postId, req.user.id);
    return { count };
  }

  // いいねを取り消す
  @UseGuards(JwtAuthGuard)
  @Delete(':postId')
  async unlike(
    @Param('postId', ParseIntPipe) postId: number,
    @Req() req: AuthRequest,
  ) {
    const count = await this.likeService.unlike(postId, req.user.id);
    return { count };
  }

  // ログインユーザーがいいねした投稿一覧
  @UseGuards(JwtAuthGuard)
  @Get()
  async getLikes(@Req() req: AuthRequest) {
    return this.likeService.getLikes(req.user.id);
  }

  // 投稿ごとのいいね数を取得
  @Get('count/:postId')
  async getLikeCount(@Param('postId', ParseIntPipe) postId: number) {
    const count = await this.prisma.like.count({
      where: { postId },
    });
    return { count };
  }

  // ログインユーザーがその投稿をいいねしているか判定
  @UseGuards(JwtAuthGuard)
  @Get('is-liked/:postId')
  async isLiked(
    @Param('postId', ParseIntPipe) postId: number,
    @Req() req: AuthRequest,
  ) {
    const like = await this.prisma.like.findFirst({
      where: {
        postId,
        userId: req.user.id,
      },
    });
    return { liked: !!like };
  }
}
