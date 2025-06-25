import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LikeService {
  constructor(private readonly prisma: PrismaService) {}

  async like(postId: number, userId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post) throw new NotFoundException('投稿が見つかりません');

    const alreadyLiked = await this.prisma.like.findFirst({
      where: { postId, userId },
    });
    if (alreadyLiked) return await this.prisma.like.count({ where: { postId } });

    await this.prisma.like.create({
      data: { postId, userId },
    });

    if (post.authorId !== userId) {
      const liker = await this.prisma.user.findUnique({ where: { id: userId } });

      if (liker) {
        await this.prisma.notification.create({
          data: {
            type: 'like',
            message: `${liker.name} さんがあなたの投稿にいいねしました`,
            read: false,
            receiverId: post.authorId,
            senderId: userId,
          },
        });
      }
    }

    const count = await this.prisma.like.count({ where: { postId } });
    return count;
  }

  async unlike(postId: number, userId: number) {
    await this.prisma.like.deleteMany({
      where: { postId, userId },
    });

    const count = await this.prisma.like.count({ where: { postId } });
    return count;
  }

  async getLikes(userId: number) {
    return this.prisma.like.findMany({
      where: { userId },
    });
  }
}
