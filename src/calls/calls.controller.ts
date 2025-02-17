import {
    Controller,
    Post,
    Get,
    Req,
    Res,
    Param,
  } from '@nestjs/common';
  import { Request, Response } from 'express';
  import { CallsService } from './calls.service';
  
  @Controller('api')
  export class CallsController {
    constructor(private readonly callsService: CallsService) {}
  
    @Post('incomingCall')
    async handleIncomingCall(@Req() req: Request, @Res() res: Response) {
      const event = req.body[0];
  
      try {
        // Check for subscription validation
        if (
          event.eventType ===
          'Microsoft.EventGrid.SubscriptionValidationEvent'
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
      @Req() req: Request,
      @Res() res: Response,
      @Param('contextId') contextId: string
    ) {
      const event = req.body[0];
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
  