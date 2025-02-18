import {
  AnswerCallOptions,
  AnswerCallResult,
  CallAutomationClient,
  MediaStreamingOptions,
  type CallConnected,
  type CallDisconnected,
  type MediaStreamingFailed,
  type MediaStreamingStarted,
  type MediaStreamingStopped,
} from '@azure/communication-call-automation';
import { Injectable } from '@nestjs/common';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { IncomingCallRequestBody } from './calls.controller';
import { AzureOpenAiService } from './azure-openai.service';

config();

export type CustomCallAutomationEvent =
  | {
      type: 'Microsoft.Communication.MediaStreamingStarted';
      data: MediaStreamingStarted;
    }
  | {
      type: 'Microsoft.Communication.MediaStreamingStopped';
      data: MediaStreamingStopped;
    }
  | {
      type: 'Microsoft.Communication.CallConnected';
      data: CallConnected;
    }
  | {
      type: 'Microsoft.Communication.CallDisconnected';
      data: CallDisconnected;
    }
  | {
      type: 'Microsoft.Communication.MediaStreamingFailed';
      data: MediaStreamingFailed;
    };

const voiceBotMapping = {
  '+12515382263': {
    systemPrompt: `# System Role
You are a real-time AI translation assistant facilitating communication between an English-speaking nurse and Hindi-speaking patients during home clinical visits. Your sole purpose is to translate accurately and naturally between English and Hindi. **Do not answer any questions or provide additional information—only act as a translator.**  

## Instructions  

### 1. Real-Time Translation  
- When the nurse speaks in English, instantly translate her words into Hindi with proper medical terminology.  
- When the patient speaks in Hindi, instantly translate their words into fluent, natural English.  

### 2. Medical Context Awareness  
- Use medical terminology accurately.  
- If a word or phrase has multiple meanings, prioritize medical or caregiving-related interpretations.  
- Adapt to common clinical visit topics, such as symptoms, medications, vital signs, and patient history.  

### 3. Clear & Natural Communication  
- Use simple, easy-to-understand Hindi for patients who may have limited medical literacy.  
- Ensure the tone remains professional, warm, and empathetic, suitable for a healthcare setting.  
- If a phrase is ambiguous, provide the most relevant interpretation while preserving accuracy.  

### 4. Structured Turn-Taking  
- Clearly indicate who is speaking (Nurse or Patient).  
- Maintain smooth conversational flow with minimal delay.  
- Avoid unnecessary filler words and keep translations concise.  

### 5. Handling Complex Phrases & Cultural Sensitivity  
- If a phrase is difficult to translate directly, rephrase it in a culturally appropriate way while maintaining the original intent.  
- Be mindful of medical privacy and confidentiality when translating sensitive health topics.  

## **Utmost Importance**  
- **You must not answer any questions or provide explanations.**  
- **Only translate between English and Hindi.**  
- **Do not generate responses beyond translation.**  
- **Do not provide personal opinions or advice.**`,
  },

  '+18777108468': {
    systemPrompt: `You are an AI assistant that helps people find information. Warmly greet the person and ask for the name of the person speaking. Wait for some time before he responds. After that ask them how you can help them. Respond with exact same text that you got from function call.`,
    tools: [
      {
        type: 'function',
        name: 'referToAICompanion',
        description:
          'Call this to get information about AI companion and Vaalee.',
        parameters: {
          type: 'object',
          properties: {
            user_query: {
              type: 'string',
              description: 'User query to refer to AI companion and Vaalee',
            },
          },
          required: ['user_query'],
          additionalProperties: false,
        },
      },
    ],
  },
};

@Injectable()
export class CallsService {
  private acsClient: CallAutomationClient;
  private answerCallResult: AnswerCallResult;
  private callerId: string;

  constructor(private azureOpenAiService: AzureOpenAiService) {
    const connectionString = process.env.CONNECTION_STRING || '';
    this.acsClient = new CallAutomationClient(connectionString);
    console.log('Initialized ACS Client.');
  }

  async handleIncomingCall(
    eventData: IncomingCallRequestBody['data'],
  ): Promise<void> {
    this.callerId = eventData.from.rawId;
    const uuid = uuidv4();
    const callbackUri = `${process.env.CALLBACK_URI}/api/callbacks/${uuid}?callerId=${this.callerId}`;
    const incomingCallContext = eventData.incomingCallContext;
    // Replace the "https" protocol with "wss" for WebSocket transport.
    const websocketUrl = process.env.CALLBACK_URI!.replace(
      /^https:\/\//,
      'wss://',
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
      answerCallOptions,
    );

    console.log(
      `Answer call ConnectionId: ${this.answerCallResult.callConnectionProperties.callConnectionId}`,
    );
  }

  async processCallbackEvent(event: CustomCallAutomationEvent): Promise<void> {
    switch (event.type) {
      case 'Microsoft.Communication.CallConnected': {
        const eventData = event.data;
        const callConnectionId = eventData.callConnectionId;
        console.log(
          `Received Event: ${event.type}, Correlation Id: ${eventData.correlationId}, CallConnectionId: ${callConnectionId}`,
        );
        const callConnectionProperties = await this.acsClient
          .getCallConnection(callConnectionId)
          .getCallConnectionProperties();

        const skypeNumber = callConnectionProperties.answeredFor?.phoneNumber!;

        // Start the Azure OpenAI conversation and handle any errors
        this.azureOpenAiService
          .startConversation({
            systemPrompt: voiceBotMapping[skypeNumber].systemPrompt,
            tools: voiceBotMapping[skypeNumber].tools,
          })
          .catch((error) => {
            console.error('Error starting conversation:', error);
          });
        break;
      }
      case 'Microsoft.Communication.MediaStreamingStarted': {
        const eventData = event.data;
        console.log(
          `Operation context: ${eventData.operationContext}, contentType: ${eventData.mediaStreamingUpdate?.contentType}, status: ${eventData.mediaStreamingUpdate?.mediaStreamingStatus}`,
        );
        break;
      }
      case 'Microsoft.Communication.MediaStreamingStopped': {
        const eventData = event.data;
        console.log(
          `Operation context: ${eventData.operationContext}, contentType: ${eventData.mediaStreamingUpdate?.contentType}, status: ${eventData.mediaStreamingUpdate?.mediaStreamingStatus}`,
        );
        break;
      }
      case 'Microsoft.Communication.MediaStreamingFailed': {
        const eventData = event.data;
        console.log(
          `Operation context: ${eventData.operationContext}, Code: ${eventData.resultInformation?.code}, Subcode: ${eventData.resultInformation?.subCode}, Message: ${eventData.resultInformation?.message}`,
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
