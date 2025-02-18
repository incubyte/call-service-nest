import { Injectable } from '@nestjs/common';
import WebSocket from 'ws';
import { config } from 'dotenv';
import {
  LowLevelRTClient,
  SessionUpdateMessage,
  ServerMessageType,
  ResponseFunctionCallArgumentsDoneMessage,
  ItemCreateMessage,
} from 'rt-client';
import { OutStreamingData } from '@azure/communication-call-automation';
import { getRetriever } from './retrieval.service';

config();

const openAiServiceEndpoint = process.env.AZURE_OPENAI_SERVICE_ENDPOINT || '';
const openAiKey = process.env.AZURE_OPENAI_SERVICE_KEY || '';
const openAiDeploymentModel =
  process.env.AZURE_OPENAI_DEPLOYMENT_MODEL_NAME || '';

@Injectable()
export class AzureOpenAiService {
  private realtimeStreaming: LowLevelRTClient;
  private ws: WebSocket;
  private systemPrompt?: string;
  private tools?: {
    type: string;
    name: string;
    description: string;
    parameters: any;
  }[];

  async startConversation({
    systemPrompt,
    tools,
  }: {
    systemPrompt: string;
    tools?: {
      type: string;
      name: string;
      description: string;
      parameters: any;
    }[];
  }): Promise<void> {
    console.log({
      openAiDeploymentModel,
      openAiServiceEndpoint,
      openAiKey,
    });

    this.systemPrompt = systemPrompt;
    this.tools = tools;

    if (!systemPrompt && !tools) {
      throw new Error('System prompt and tools are required');
    }

    await this.startRealtime(
      openAiServiceEndpoint,
      openAiKey,
      openAiDeploymentModel,
    );
  }

  private async startRealtime(
    endpoint: string,
    apiKey: string,
    deploymentOrModel: string,
  ) {
    try {
      this.realtimeStreaming = new LowLevelRTClient(
        new URL(endpoint),
        { key: apiKey },
        { deployment: deploymentOrModel },
      );
      console.log('sending session config');
      await this.realtimeStreaming.send(this.createConfigMessage());
      console.log('sent session config');
    } catch (error) {
      console.error('Error during startRealtime:', error);
    }

    // Start handling realtime messages asynchronously.
    setImmediate(() => {
      this.handleRealtimeMessages().catch((error) => {
        console.error('Error handling real-time messages:', error);
      });
    });
  }

  private createConfigMessage(): SessionUpdateMessage {
    const configMessage: SessionUpdateMessage = {
      type: 'session.update',
      session: {
        instructions: this.systemPrompt,
        voice: 'shimmer',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
        },
        input_audio_transcription: {
          model: 'whisper-1',
        },
        tools: this.tools,
        tool_choice: (this.tools?.length ?? 0) > 0 ? 'auto' : 'none',
      },
    };
    return configMessage;
  }

  async sendAudioToExternalAi(data: string): Promise<void> {
    try {
      if (data) {
        await this.realtimeStreaming.send({
          type: 'input_audio_buffer.append',
          audio: data,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  private async executeFunctionCall(
    message: ServerMessageType,
  ): Promise<string> {
    try {
      const functionCallMessage =
        message as ResponseFunctionCallArgumentsDoneMessage;
      const argumentsObject = JSON.parse(functionCallMessage.arguments) as {
        user_query: string;
      };
      const result = await this.referToAICompanion(argumentsObject.user_query);
      console.log('Function Call Results:', result);
      return result;
    } catch (error) {
      console.error('Error handling function call:', error);
    }
    return '';
  }

  private async referToAICompanion(user_query: string): Promise<string> {
    try {
      console.log('Referring to medical database for:', user_query);
      const similarDocs = await getRetriever('tenant-a', user_query);
      const similarChunksJoined = similarDocs.context
        .map((doc) => doc.pageContent)
        .join('\n');
      return similarChunksJoined;
    } catch (error) {
      console.error('Error referring to medical database:', error);
      return "Sorry, I couldn't find the information you're looking for. Please try again.";
    }
  }

  private async handleRealtimeMessages(): Promise<void> {
    for await (const message of this.realtimeStreaming.messages()) {
      switch (message.type) {
        case 'session.created':
          console.log('session started with id:', message.session.id);
          break;
        case 'response.audio_transcript.delta':
          // Optionally process partial transcription here.
          break;
        case 'response.function_call_arguments.done': {
          console.log('Function call arguments done');
          const result = await this.executeFunctionCall(message);
          console.log('Function Call Results:', result);
          const responseMessage: ItemCreateMessage = {
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: message.call_id,
              output: result,
            },
          };
          await this.realtimeStreaming.send(responseMessage);
          // Trigger response creation
          await this.realtimeStreaming.send({ type: 'response.create' });
          break;
        }
        case 'response.audio.delta':
          await this.receiveAudioForOutbound(message.delta);
          break;
        case 'input_audio_buffer.speech_started':
          console.log(
            `Voice activity detection started at ${message.audio_start_ms} ms`,
          );
          await this.stopAudio();
          break;
        case 'conversation.item.input_audio_transcription.completed':
          console.log(`User:- ${message.transcript}`);
          break;
        case 'response.audio_transcript.done':
          console.log(`AI:- ${message.transcript}`);
          break;
        case 'response.done':
          console.log(message.response.status);
          break;
        case 'error':
          console.error(message.error);
          break;
        default:
          break;
      }
    }
  }

  private async stopAudio(): Promise<void> {
    try {
      const jsonData = OutStreamingData.getStopAudioForOutbound();
      await this.sendMessage(jsonData);
    } catch (e) {
      console.error(e);
    }
  }

  private async receiveAudioForOutbound(data: string): Promise<void> {
    try {
      const jsonData = OutStreamingData.getStreamingDataForOutbound(data);
      await this.sendMessage(jsonData);
    } catch (e) {
      console.error(e);
    }
  }

  private async sendMessage(data: string): Promise<void> {
    const maxRetries = 5;
    let retries = 0;
    while (retries < maxRetries) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(data);
        return;
      } else {
        console.warn(
          `WebSocket is not open. Retrying... (${retries + 1}/${maxRetries})`,
        );
        retries++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    console.error('Failed to send message: WebSocket connection is not open.');
  }

  // Called from our WebSocket connection setup to initialize the socket
  initWebsocket(socket: WebSocket): void {
    this.ws = socket;
  }
}
