import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.headers.authorization) {
      return true;
    }

    return super.canActivate(context);
  }
}
