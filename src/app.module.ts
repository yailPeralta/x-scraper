import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongodbModule } from './common/database/mongodb/mongodb.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validationSchema } from './common/config/env.validation';
import { TwitterScraperModule } from './modules/twitter/scraper/twitter-scraper.module';
import { TwitterTrackerModule } from './modules/twitter/tracker/twitter-tracker.module';
import { BotModule } from './modules/twitter/bot/bot.module';
import { TasksModule } from './common/tasks/tasks.module';
import { TwitterListsModule } from './modules/twitter/lists/twitter-lists.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    EventEmitterModule.forRoot(),
    MongodbModule,
    TwitterScraperModule,
    TwitterTrackerModule,
    BotModule,
    TasksModule,
    TwitterListsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
