import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as WebSocket from 'ws';
import { AzureOpenAiService } from './calls/azure-openai.service';
import { MediaStreamingHandler } from './calls/media-streaming.handler';
import { CallsService } from './calls/calls.service';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);
  console.log(`Server is listening on port ${PORT}`);
  
  // Get the HTTP server from Nest
  const server = app.getHttpServer();

  // Initialize your ACS Client (from your callsService) at startup.
  const callsService = app.get(CallsService);
  await callsService.initAcsClient();

  // Attach the WebSocket server.
  const wss = new WebSocket.Server({ server });
  const azureOpenAiService = app.get(AzureOpenAiService);
  const mediaStreamingHandler = app.get(MediaStreamingHandler);

  wss.on('connection', async (ws: WebSocket) => {
    console.log('Client connected');
    
    // Pass the WebSocket instance to the AzureOpenAiService
    azureOpenAiService.initWebsocket(ws);
    
    // Optionally, start the Azure OpenAI conversation if needed.
    await azureOpenAiService.startConversation();

    ws.on('message', async (packetData: WebSocket.Data) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Assume packetData is an ArrayBuffer. Adjust if needed.
          const buffer =
            packetData instanceof Buffer
              ? packetData.buffer.slice(
                  packetData.byteOffset,
                  packetData.byteOffset + packetData.byteLength
                )
              : packetData;
          await mediaStreamingHandler.processWebsocketMessageAsync(
            buffer as ArrayBuffer
          );
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
  console.log(
    `WebSocket server running on port ${PORT}`
  );
}
bootstrap();
