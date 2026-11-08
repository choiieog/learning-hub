import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET /api/health — dùng để kiểm tra server sống và cho healthcheck khi deploy. */
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
