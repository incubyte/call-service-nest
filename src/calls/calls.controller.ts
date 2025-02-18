import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CallsService, CustomCallAutomationEvent } from './calls.service';

export type IncomingCallRequestBody = {
  eventType: string;
  data: {
    validationCode: string;
    from: {
      rawId: string;
    };
    incomingCallContext: string;
  };
};

@Controller('api')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('incomingCall')
  async handleIncomingCall(
    @Body() body: IncomingCallRequestBody[],
    @Res() res: Response,
  ) {
    try {
      const event = body[0];
      // Check for subscription validation
      if (
        event.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent'
      ) {
        console.log('Received SubscriptionValidation event');
        return res.status(200).json({
          validationResponse: event.data.validationCode,
        });
      }

      // Pass the incoming call event data to the service
      await this.callsService.handleIncomingCall(event.data);
      res.status(200).send();
    } catch (error) {
      console.error('Error during the incoming call event.', error);
      res.status(500).send('Error processing the event');
    }
  }

  @Post('callbacks/:contextId')
  async handleCallbacks(
    @Body() body: CustomCallAutomationEvent[],
    @Res() res: Response,
  ) {
    const event = body[0];

    try {
      await this.callsService.processCallbackEvent(event);
      res.status(200).send();
    } catch (error) {
      console.error('Error processing callback event:', error);
      res.status(500).send('Callback error');
    }
  }

  @Get()
  getHello(@Res() res: Response) {
    res.send('Hello ACS CallAutomation from NestJS!');
  }
}
