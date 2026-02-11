import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongodbModule } from './common/database/mongodb/mongodb.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validationSchema } from './common/config/env.validation';
import { TwitterScraperModule } from './modules/twitter-scraper/twitter-scraper.module';

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
    MongodbModule,
    TwitterScraperModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
