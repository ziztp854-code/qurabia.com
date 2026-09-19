import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('health', () => {
    it('returns the service health', () => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        RENDER_GIT_COMMIT: '800e94f3ed7121640602027af5a15e524f1e515b',
      });

      expect(appController.getHealth()).toEqual({
        commit: '800e94f3',
        service: 'tahaddi-realtime',
        status: 'ok',
      });
    });
  });
});
