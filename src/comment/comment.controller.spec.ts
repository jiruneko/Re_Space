import { Test } from '@nestjs/testing';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
describe('CommentController', () => {
  it('resolves its explicit service dependency', async () => {
    const module = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [{ provide: CommentService, useValue: {} }],
    }).compile();
    expect(module.get(CommentController)).toBeDefined();
  });
});
