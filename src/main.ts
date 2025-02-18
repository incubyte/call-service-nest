import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as WebSocket from 'ws';
import { AzureOpenAiService } from './calls/azure-openai.service';
import { MediaStreamingHandler } from './calls/media-streaming.handler';
import { CallsService } from './calls/calls.service';
import { config } from 'dotenv';
import { Server } from 'http';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);
  console.log(`Server is listening on port ${PORT}`);

  // Get the HTTP server from Nest
  const server = app.getHttpServer() as Server;

  // Initialize your ACS Client (from your callsService) at startup.
  const callsService = app.get(CallsService);
  await callsService.initAcsClient();

  // Attach the WebSocket server.
  const wss = new WebSocket.Server({ server });
  const azureOpenAiService = app.get(AzureOpenAiService);
  const mediaStreamingHandler = app.get(MediaStreamingHandler);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    // Pass the WebSocket instance to the AzureOpenAiService
    azureOpenAiService.initWebsocket(ws);

    // Start the Azure OpenAI conversation and handle any errors
    azureOpenAiService.startConversation().catch((error) => {
      console.error('Error starting conversation:', error);
    });

    ws.on('message', (packetData: WebSocket.Data) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Assume packetData is an ArrayBuffer. Adjust if needed.
          const buffer =
            packetData instanceof Buffer
              ? packetData.buffer.slice(
                  packetData.byteOffset,
                  packetData.byteOffset + packetData.byteLength,
                )
              : packetData;
          mediaStreamingHandler
            .processWebsocketMessageAsync(buffer as ArrayBuffer)
            .catch((error) => {
              console.error('Error processing message:', error);
            });
        } else {
          console.warn(`ReadyState: ${ws.readyState}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  console.log(`WebSocket server running on port ${PORT}`);
}

void bootstrap();
