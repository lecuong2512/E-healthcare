import {
  Body,
  Controller,
  Get,
  Put,
  Req,
} from "@nestjs/common";
import { UpdatePhrProfileDto } from './dto/update-phr-profile.dto';
import {
  PhrProfile,
  UpdatePhrProfileRequest,
} from "@shared/interfaces";
import { Role } from "@shared/enums";

import { Roles } from "../../common/decorators/auth.decorators";
import { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import { PhrService } from "./phr.service";

@Controller("phr")
@Roles(Role.PATIENT)
export class PhrController {
  constructor(private readonly phrService: PhrService) {}

  @Get("me")
  async getMyPhr(
    @Req() req: AuthenticatedRequest,
  ): Promise<PhrProfile> {
    return this.phrService.getMyPhr(req.auth!.userId);
  }

  @Put("me")
  async updateMyPhr(
    @Req() req: AuthenticatedRequest,
    @Body() request: UpdatePhrProfileDto,
  ): Promise<PhrProfile> {
    return this.phrService.updateMyPhr(
      req.auth!.userId,
      request,
    );
  }
}