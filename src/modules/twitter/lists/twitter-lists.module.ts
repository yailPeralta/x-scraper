import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  TwitterList,
  TwitterListSchema,
} from '../../../common/database/mongodb/schemas/twitter/twitter-list.schema';
import {
  XUser,
  XUserSchema,
} from '../../../common/database/mongodb/schemas/twitter/x-user.schema';

import { TwitterListsController } from './controllers/twitter-lists.controller';
import { TwitterListsService } from './services/twitter-lists.service';
import { TwitterListRepository } from './repositories/twitter-list.repository';
import { XUserRepository } from '../scraper/repositories/x-user.repository';

// TwitterTrackerModule exports XdkClientService
import { TwitterTrackerModule } from '../tracker/twitter-tracker.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TwitterList.name, schema: TwitterListSchema },
      { name: XUser.name, schema: XUserSchema },
    ]),
    TwitterTrackerModule,
  ],
  controllers: [TwitterListsController],
  providers: [TwitterListsService, TwitterListRepository, XUserRepository],
  exports: [TwitterListsService, TwitterListRepository],
})
export class TwitterListsModule {}
