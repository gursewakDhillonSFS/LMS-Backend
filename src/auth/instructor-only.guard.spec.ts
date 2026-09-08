import { InstructorOnlyGuard } from './instructor-only.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('InstructorOnlyGuard', () => {
  const guard = new InstructorOnlyGuard();

  const ctx = (role?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role, userId: '1' } : null }),
      }),
    }) as unknown as ExecutionContext;

  it('allows instructor', () => {
    expect(guard.canActivate(ctx('instructor'))).toBe(true);
  });

  it('blocks teacher', () => {
    expect(() => guard.canActivate(ctx('teacher'))).toThrow(ForbiddenException);
  });

  it('blocks student', () => {
    expect(() => guard.canActivate(ctx('student'))).toThrow(ForbiddenException);
  });

  it('blocks missing user', () => {
    expect(() => guard.canActivate(ctx())).toThrow(ForbiddenException);
  });
});
