import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../user/schemas/user.schema';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  onboardingStatus?: string;
  isSubscribed?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtPayload) {
    let organisationId: string | undefined = undefined;
    let teacherId: string | undefined = undefined;
    let role = payload.role;
    let onboardingStatus = payload.onboardingStatus;

    try {
      const user = await this.userModel
        .findById(payload.sub)
        .select('organisationId teacherId role onboardingStatus')
        .lean();

      if (user) {
        if (user.organisationId) {
          organisationId = String(user.organisationId);
        }
        if (user.teacherId) {
          teacherId = String(user.teacherId);
        }
        if (user.role) {
          role = user.role;
        }
        if (user.onboardingStatus) {
          onboardingStatus = user.onboardingStatus;
        }
      }
    } catch {
      // Non-blocking fallback to token payload
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role,
      onboardingStatus,
      isSubscribed: payload.isSubscribed,
      organisationId,
      teacherId,
      instructorId: teacherId,
    };
  }
}
