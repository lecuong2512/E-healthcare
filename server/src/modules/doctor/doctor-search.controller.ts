import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { Public } from "../../common/decorators/auth.decorators";
import { DoctorSearchService } from "./doctor-search.service";
import { SearchDoctorDto } from "./dto/search-doctor.dto";

@Controller("doctors")
@Public()
export class DoctorSearchController {
  constructor(private readonly service: DoctorSearchService) {}

  @Get("search")
  search(@Query() dto: SearchDoctorDto) {
    return this.service.search(dto);
  }

  @Get("specialties")
  specialties() {
    return this.service.specialties();
  }

  @Get(":doctorId")
  findOne(@Param("doctorId", ParseUUIDPipe) doctorId: string) {
    return this.service.findOne(doctorId);
  }
}
