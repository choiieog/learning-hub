import { Role } from '../enums/role.enum';

/** Payload gắn vào request.user sau khi JwtAuthGuard xác thực xong. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
