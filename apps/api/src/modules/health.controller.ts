import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth';
import { config } from '../infra';

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
        ai: 'AI Gateway: quản lý khóa/model/giá/hạn mức; chưa có chức năng AI nghiệp vụ',
        uniData360: 'Giả lập (mock) — chưa có hợp đồng API thật',
      },
      time: new Date().toISOString(),
    };
  }
}
