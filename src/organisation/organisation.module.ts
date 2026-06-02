import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';
import {
  Organisation,
  OrganisationSchema,
} from './schemas/organisation.schema';
import { User, UserSchema } from '../user/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organisation.name, schema: OrganisationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [OrganisationController],
  providers: [OrganisationService],
  exports: [OrganisationService, MongooseModule],
})
export class OrganisationModule {}
