import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  // 他のメソッド...

  async delete(id: number, userId: number) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.authorId !== userId) {
      throw new ForbiddenException('削除権限がありません');
    }

    await this.prisma.post.delete({ where: { id } });
    return { message: '削除されました' };
  }
}
