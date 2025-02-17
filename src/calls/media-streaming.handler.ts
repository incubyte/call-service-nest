import { Injectable } from '@nestjs/common';
import {
  StreamingData,
  StreamingDataKind,
  AudioData,
} from '@azure/communication-call-automation';
import { AzureOpenAiService } from './azure-openai.service';

@Injectable()
export class MediaStreamingHandler {
  constructor(private readonly azureOpenAiService: AzureOpenAiService) {}

  async processWebsocketMessageAsync(
    receivedBuffer: ArrayBuffer
  ): Promise<void> {
    const result = StreamingData.parse(receivedBuffer);
    const kind = StreamingData.getStreamingKind();

    if (kind === StreamingDataKind.AudioData) {
      const audioData = (result as AudioData).data;
      await this.azureOpenAiService.sendAudioToExternalAi(audioData);
    }
  }
}
