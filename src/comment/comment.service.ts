import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  // コメント作成時に通知も送信
  async create(dto: CreateCommentDto, userId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: dto.postId },
      include: { author: true },
    });

    if (!post) {
      throw new NotFoundException('投稿が見つかりません');
    }

    const comment = await this.prisma.comment.create({
      data: {
        content: dto.content,
        postId: dto.postId,
        userId: userId,
      },
    });

    // 投稿者が自分でない場合に通知を送信
    if (post.authorId !== userId) {
      const commenter = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (commenter) {
        await this.prisma.notification.create({
          data: {
            type: 'comment',
            message: `${commenter.name} さんがあなたの投稿にコメントしました`,
            read: false,
            receiver: { connect: { id: post.authorId } },
            sender: { connect: { id: userId } },
          },
        });
      }
    }

    return comment;
  }

  async findByPostId(postId: number) {
  return this.prisma.comment.findMany({
    where: { postId },
    include: {
      user: {
        select: { id: true, name: true }, // ← 必要に応じてemailなども
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

  async updateComment(id: number, content: string, userId: number) {
    const existing = await this.prisma.comment.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new ForbiddenException('編集できません');
    }
    return this.prisma.comment.update({
      where: { id },
      data: { content },
    });
  }

  async getCommentsByPost(postId: number) {
  return this.prisma.comment.findMany({
    where: { postId },
    include: {
      user: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

  async deleteComment(id: number, userId: number) {
    const existing = await this.prisma.comment.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new ForbiddenException('削除できません');
    }
    return this.prisma.comment.delete({ where: { id } });
  }
}
