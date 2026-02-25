import { Module } from '@nestjs/common';
import { TwitterTrackerModule } from '../tracker/twitter-tracker.module';
import { TwitterBotService } from './services/twitter-bot.service';
import { BotController } from './controllers/bot.controller';

@Module({
  imports: [TwitterTrackerModule],
  controllers: [BotController],
  providers: [TwitterBotService],
  exports: [TwitterBotService],
})
export class BotModule {}
