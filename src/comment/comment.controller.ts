import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentService } from './comment.service';
import { AuthRequest } from '../types/auth-request';

@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  // ✅ コメント作成（/posts/:postId/comments）ログイン必須
  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  createComment(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthRequest,
  ) {
    return this.commentService.create({ ...dto, postId: +postId }, req.user.id);
  }

  // ✅ コメント更新（ログイン必須）
  @Put('comments/:id')
  @UseGuards(JwtAuthGuard)
  updateComment(
    @Param('id') id: string,
    @Body('content') content: string,
    @Req() req: AuthRequest,
  ) {
    return this.commentService.updateComment(+id, content, req.user.id);
  }

  // ✅ 投稿IDに紐づくコメント一覧取得（ログイン不要）
  @Get('posts/:postId/comments')
  findByPost(@Param('postId') postId: string) {
    return this.commentService.findByPostId(+postId);
  }

  // ✅ コメント削除（ログイン必須）
  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.commentService.deleteComment(+id, req.user.id);
  }
}
