import { Injectable } from '@nestjs/common';
import {
  CallAutomationClient,
  AnswerCallOptions,
  AnswerCallResult,
  MediaStreamingOptions,
} from '@azure/communication-call-automation';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

config();

@Injectable()
export class CallsService {
  private acsClient: CallAutomationClient;
  private answerCallResult: AnswerCallResult;
  private callerId: string;

  async initAcsClient(): Promise<void> {
    const connectionString = process.env.CONNECTION_STRING || '';
    this.acsClient = new CallAutomationClient(connectionString);
    console.log('Initialized ACS Client.');
  }

  async handleIncomingCall(eventData: any): Promise<void> {
    this.callerId = eventData.from.rawId;
    const uuid = uuidv4();
    const callbackUri = `${process.env.CALLBACK_URI}/api/callbacks/${uuid}?callerId=${this.callerId}`;
    const incomingCallContext = eventData.incomingCallContext;
    // Replace the "https" protocol with "wss" for WebSocket transport.
    const websocketUrl = process.env.CALLBACK_URI!.replace(
      /^https:\/\//,
      'wss://'
    );
    const mediaStreamingOptions: MediaStreamingOptions = {
      transportUrl: websocketUrl,
      transportType: 'websocket',
      contentType: 'audio',
      audioChannelType: 'unmixed',
      startMediaStreaming: true,
      enableBidirectional: true,
      audioFormat: 'Pcm24KMono',
    };

    const answerCallOptions: AnswerCallOptions = {
      mediaStreamingOptions: mediaStreamingOptions,
    };

    // Answer the call using ACS.
    this.answerCallResult = await this.acsClient.answerCall(
      incomingCallContext,
      callbackUri,
      answerCallOptions
    );

    console.log(
      `Answer call ConnectionId: ${this.answerCallResult.callConnectionProperties.callConnectionId}`
    );
  }

  async processCallbackEvent(event: any): Promise<void> {
    const eventData = event.data;
    const callConnectionId = eventData.callConnectionId;
    console.log(
      `Received Event: ${event.type}, Correlation Id: ${eventData.correlationId}, CallConnectionId: ${callConnectionId}`
    );

    switch (event.type) {
      case 'Microsoft.Communication.CallConnected': {
        const callConnectionProperties =
          await this.acsClient
            .getCallConnection(callConnectionId)
            .getCallConnectionProperties();
        console.log(
          'MediaStreamingSubscription:',
          JSON.stringify(callConnectionProperties.mediaStreamingSubscription)
        );
        break;
      }
      case 'Microsoft.Communication.MediaStreamingStarted': {
        console.log(
          `Operation context: ${eventData.operationContext}, contentType: ${eventData.mediaStreamingUpdate.contentType}, status: ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`
        );
        break;
      }
      case 'Microsoft.Communication.MediaStreamingStopped': {
        console.log(
          `Operation context: ${eventData.operationContext}, contentType: ${eventData.mediaStreamingUpdate.contentType}, status: ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`
        );
        break;
      }
      case 'Microsoft.Communication.MediaStreamingFailed': {
        console.log(
          `Operation context: ${eventData.operationContext}, Code: ${eventData.resultInformation.code}, Subcode: ${eventData.resultInformation.subCode}, Message: ${eventData.resultInformation.message}`
        );
        break;
      }
      case 'Microsoft.Communication.CallDisconnected': {
        // Optionally handle call disconnection
        break;
      }
      default:
        break;
    }
  }
}
