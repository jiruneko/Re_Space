import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthRequest } from '../types/auth-request';

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  // 投稿作成
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePostDto, @Req() req: AuthRequest) {
    return this.postService.create(dto, req.user.id);
  }

  // ホームフィード取得（自分＋フォロー中の投稿）
  @Get('home')
  @UseGuards(JwtAuthGuard)
  getHomeFeed(@Req() req: AuthRequest) {
    return this.postService.findHomeFeed(req.user.id);
  }

  // 自分の投稿取得（プロフィール用）
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMyPosts(@Req() req: AuthRequest) {
    return this.postService.findByUserId(req.user.id);
  }

  // コメント一覧取得（特定の投稿に紐づく）
  @Get(':id/comments')
  @UseGuards(JwtAuthGuard)
  getComments(@Param('id', ParseIntPipe) postId: number) {
    return this.postService.getComments(postId);
  }

  // 投稿編集
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @Req() req: AuthRequest,
  ) {
    return this.postService.update(id, dto, req.user.id);
  }

  @Get('user/:id')
  @UseGuards(JwtAuthGuard)
  async getPostsByUser(@Param('id') id: string) {
  return this.postService.findByUserId(Number(id));
}

  // 投稿削除
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    return this.postService.remove(id, req.user.id);
  }
}
