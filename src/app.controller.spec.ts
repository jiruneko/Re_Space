import { AppController } from './app.controller';
describe('legacy root controller', () => {
  it('returns its status message', () => {
    expect(new AppController().getRoot()).toBe('NestJS is running!');
  });
});
