import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // AdminModule dùng để quản lý / cảnh báo tài khoản
})
export class UsersModule {}
