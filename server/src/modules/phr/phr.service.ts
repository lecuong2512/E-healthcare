import {
  ConflictException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, QueryFailedError } from "typeorm";
import { DateOfBirthPrecision } from "@shared/enums";

import {
  PhrProfile,
  UpdatePhrProfileRequest,
} from "@shared/interfaces";

import { UserEntity } from "../../database/entities/user.entity";
import { PersonalHealthProfileEntity } from "../../database/entities/auth.entity";

@Injectable()
export class PhrService {
  constructor(private readonly dataSource: DataSource) {}

  async getMyPhr(userId: string): Promise<PhrProfile> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    const phrRepo = this.dataSource.getRepository(
      PersonalHealthProfileEntity,
    );

    const user = await userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "Không tìm thấy người dùng.",
      });
    }

    const phr = await phrRepo.findOne({
      where: { userId },
    });

    if (!phr) {
      throw new NotFoundException({
        code: "PHR_NOT_FOUND",
        message: "Không tìm thấy hồ sơ sức khỏe cá nhân.",
      });
    }

    return this.toPhrProfile(user, phr);
  }

  async updateMyPhr(
    userId: string,
    request: UpdatePhrProfileRequest,
  ): Promise<PhrProfile> {
    const birthday = new Date(`${request.dateOfBirth}T00:00:00Z`);
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 15);
    if (birthday > cutoff)
      throw new BadRequestException({ code: "INVALID_DATE_OF_BIRTH", message: "Bệnh nhân phải từ 15 tuổi trở lên." });
    const userRepo = this.dataSource.getRepository(UserEntity);
    const phrRepo = this.dataSource.getRepository(
      PersonalHealthProfileEntity,
    );

    const user = await userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "Không tìm thấy người dùng.",
      });
    }

    const phr = await phrRepo.findOne({
      where: { userId },
    });

    if (!phr) {
      throw new NotFoundException({
        code: "PHR_NOT_FOUND",
        message: "Không tìm thấy hồ sơ sức khỏe cá nhân.",
      });
    }

    user.fullName = request.fullName;
    user.gender = request.gender;
    user.dateOfBirth = request.dateOfBirth;
    user.dateOfBirthPrecision = DateOfBirthPrecision.FULL_DATE;

    phr.citizenId = request.citizenId.trim() || null;
    phr.address = request.address;
    phr.healthInsurance = request.healthInsurance;
    phr.bloodType = request.bloodType;
    phr.allergies = request.allergies;
    phr.chronicDiseases = request.chronicDiseases;
    phr.surgeryHistory = request.surgeryHistory;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(UserEntity, user);
        await manager.save(PersonalHealthProfileEntity, phr);
      });
    } catch (error) {
      const driverError = error instanceof QueryFailedError
        ? error.driverError as { code?: string; constraint?: string }
        : null;
      if (driverError?.code === '23505' && driverError.constraint === 'uq_phr_citizen_id') {
        throw new ConflictException('CCCD/CMND đã thuộc hồ sơ bệnh nhân khác.');
      }
      throw error;
    }

    return this.toPhrProfile(user, phr);
  }

  private toPhrProfile(
    user: UserEntity,
    phr: PersonalHealthProfileEntity,
  ): PhrProfile {
    return {
      fullName: user.fullName,
      citizenId: phr.citizenId,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      dateOfBirthPrecision: user.dateOfBirthPrecision,
      address: phr.address,
      healthInsurance: phr.healthInsurance,
      bloodType: phr.bloodType,
      allergies: phr.allergies,
      chronicDiseases: phr.chronicDiseases,
      surgeryHistory: phr.surgeryHistory,
    };
  }
}
