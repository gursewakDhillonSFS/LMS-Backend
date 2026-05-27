import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class InstructorOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role === 'teacher') {
      throw new ForbiddenException(
        'Teachers are not authorized to modify course resources',
      );
    }
    return true;
  }
}
