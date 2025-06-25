import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  // 投稿作成
  async create(dto: CreatePostDto, userId: number) {
    try {
      return await this.prisma.post.create({
        data: {
          title: dto.title,
          content: dto.content,
          author: {
            connect: { id: userId },
          },
        },
      });
    } catch (error) {
      console.error('Post creation error:', error);
      throw new Error('投稿の作成に失敗しました');
    }
  }

  // 全投稿取得（管理者・テスト用）
  async findAll() {
    return this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        comments: {
          include: { user: { select: { name: true } } },
        },
        _count: {
          select: { Like: true },
        },
      },
    });
  }

  // 自分の投稿取得（プロフィールページ用）
  async findByUserId(userId: number) {
    const posts = await this.prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { Like: true },
        },
      },
    });

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      authorId: post.authorId,
      likeCount: post._count.Like,
    }));
  }

  // ホームフィード取得（全ユーザー投稿を表示 ※テスト用）
  async findHomeFeed(userId: number) {
    const posts = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { Like: true },
        },
      },
    });

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      authorId: post.authorId,
      authorName: post.author.name,
      likeCount: post._count.Like,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        userId: comment.user.id,
        userName: comment.user.name,
        createdAt: comment.createdAt,
      })),
    }));
  }

  // コメント一覧取得（投稿ID指定）
  async getComments(postId: number) {
    return this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  // 投稿編集
  async update(id: number, dto: UpdatePostDto, userId: number) {
    const post = await this.prisma.post.findUnique({ where: { id } });

    if (!post || post.authorId !== userId) {
      throw new ForbiddenException('投稿の編集権限がありません');
    }

    return this.prisma.post.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
      },
    });
  }

  // 投稿削除
  async remove(id: number, userId: number) {
    const post = await this.prisma.post.findUnique({ where: { id } });

    if (!post) {
      throw new NotFoundException('投稿が見つかりません');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('投稿の削除権限がありません');
    }

    await this.prisma.like.deleteMany({ where: { postId: id } });

    return this.prisma.post.delete({
      where: { id },
    });
  }
}
