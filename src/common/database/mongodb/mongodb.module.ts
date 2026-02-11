import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const username = configService.get<string>('MONGODB_USERNAME');
        const password = configService.get<string>('MONGODB_PASSWORD');
        const host = configService.get<string>('MONGODB_HOST');
        const port = configService.get<number>('MONGODB_PORT');
        const collection = configService.get<string>('MONGODB_DB_NAME');

        return {
          uri: `mongodb://${host}:${port}`,
          user: username,
          pass: password,
          dbName: collection
        };
      },
      inject: [ConfigService],
    })
  ],
})
export class MongodbModule { }
