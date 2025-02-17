import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { AzureOpenAiService } from './azure-openai.service';
import { RetrievalService } from './retrieval.service';
import { MediaStreamingHandler } from './media-streaming.handler';


@Module({
  controllers: [CallsController],
  providers: [
    CallsService,
    AzureOpenAiService,
    MediaStreamingHandler,
    RetrievalService,
  ],
})
export class CallsModule {}
