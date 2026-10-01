import { Test } from '@nestjs/testing';
import { PostController } from './post.controller';
import { PostService } from './post.service';
describe('PostController', () => {
  it('resolves its explicit service dependency', async () => {
    const module = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: {} }],
    }).compile();
    expect(module.get(PostController)).toBeDefined();
  });
});
