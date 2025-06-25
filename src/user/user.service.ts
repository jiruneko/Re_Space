import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // 指定IDのユーザー情報取得
  async findUserById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        posts: { orderBy: { createdAt: 'desc' } },
        followers: true,
        following: true,
      },
    });

    if (!user) {
      throw new NotFoundException('ユーザーが見つかりません');
    }

    return {
      id: user.id,
      name: user.name,
      posts: user.posts,
      followerCount: user.followers.length,
      followingCount: user.following.length,
      bio: user.bio,
      profileImage: user.profileImage,
    };
  }

  // 自己紹介文（bio）の更新
  async updateBio(userId: number, dto: { bio?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { bio: dto.bio },
    });
  }

  async updateProfile(userId: number, dto: { bio?: string; profileImage?: string }) {
  return this.prisma.user.update({
    where: { id: userId },
    data: {
      bio: dto.bio,
      profileImage: dto.profileImage,
    },
  });
}
}
