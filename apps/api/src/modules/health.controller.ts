import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth';
import { config } from '../common/firebase';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      env: config.appEnv,
      emulators: config.usingEmulators,
      aiMode: config.aiMode,
      uniData360Mode: config.uniMode,
      modules: {
        ai: 'Giai đoạn 3 — chưa triển khai',
        uniData360: 'Giai đoạn 3 — chưa triển khai (sẽ dùng mock, chưa có hợp đồng API thật)',
      },
      time: new Date().toISOString(),
    };
  }
}
