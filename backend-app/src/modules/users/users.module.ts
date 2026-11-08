import { Module } from '@nestjs/common';
import { AvatarFramesController } from './avatar-frames.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, AvatarFramesController],
  providers: [UsersService],
  exports: [UsersService], // AdminModule dùng để quản lý / cảnh báo tài khoản
})
export class UsersModule {}
