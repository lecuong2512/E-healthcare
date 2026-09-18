import { DataSource } from "typeorm";
import { DoctorEntity } from "../src/database/entities/doctor.entity";
import { DoctorCacheService } from "../src/modules/doctor/doctor-cache.service";
import { DoctorSearchService } from "../src/modules/doctor/doctor-search.service";

describe("DoctorSearchService", () => {
  const doctor = {
    id: "doctor-id",
    user: { fullName: "Nguyễn Văn An" },
    academicTitle: "Bác sĩ chuyên khoa II",
    specialty: { id: "specialty-id", name: "Tim mạch" },
    consultationFee: 500000,
    bioDescription: "Điều trị bệnh tim mạch",
    roomNumber: "P.201",
    ratingAverage: 4.8,
  } as DoctorEntity;

  function createDatabase(doctors: DoctorEntity[] = [doctor]) {
    const query = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(doctors.length),
      getMany: jest.fn().mockResolvedValue(doctors),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => query),
    };
    const dataSource = {
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;
    return { dataSource, query };
  }

  function createCache(cached: unknown = null) {
    return {
      key: jest.fn().mockReturnValue("cache-key"),
      getJson: jest.fn().mockResolvedValue(cached),
      setJson: jest.fn().mockResolvedValue(undefined),
    } as unknown as DoctorCacheService;
  }

  beforeEach(() => jest.clearAllMocks());

  it("applies keyword, specialty, availability, price, rating and pagination filters", async () => {
    const { dataSource, query } = createDatabase();
    const cache = createCache();
    const service = new DoctorSearchService(dataSource, cache);

    const result = await service.search({
      q: "  TIM MACH  ",
      specialtyId: "24d648df-61a9-48c7-adbf-2f6c601a7062",
      date: "2099-01-05",
      minPrice: 200000,
      maxPrice: 800000,
      minRating: 4,
      page: 2,
      limit: 5,
    });

    expect(cache.key).toHaveBeenCalledWith("list", {
      q: "tim mach",
      specialtyId: "24d648df-61a9-48c7-adbf-2f6c601a7062",
      date: "2099-01-05",
      minPrice: 200000,
      maxPrice: 800000,
      minRating: 4,
      page: 2,
      limit: 5,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "unaccent(LOWER(user.full_name)) LIKE unaccent(:keyword)",
      ),
      { keyword: "%tim mach%" },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "doctor.specialty_id = :specialtyId",
      { specialtyId: "24d648df-61a9-48c7-adbf-2f6c601a7062" },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "doctor.consultation_fee >= :minPrice",
      { minPrice: 200000 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "doctor.consultation_fee <= :maxPrice",
      { maxPrice: 800000 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "doctor.rating_average >= :minRating",
      { minRating: 4 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("FROM doctor_schedules schedule"),
      { date: "2099-01-05", available: "AVAILABLE" },
    );
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.take).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      data: [
        {
          id: "doctor-id",
          fullName: "Nguyễn Văn An",
          academicTitle: "Bác sĩ chuyên khoa II",
          specialty: { id: "specialty-id", name: "Tim mạch" },
          consultationFee: 500000,
          bioDescription: "Điều trị bệnh tim mạch",
          roomNumber: "P.201",
          ratingAverage: 4.8,
        },
      ],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });
    expect(cache.setJson).toHaveBeenCalledWith("cache-key", result, 60);
  });

  it("returns a cache hit without querying the database", async () => {
    const cached = {
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    };
    const { dataSource } = createDatabase();
    const cache = createCache(cached);
    const service = new DoctorSearchService(dataSource, cache);

    await expect(service.search({ page: 1, limit: 10 })).resolves.toBe(cached);
    expect(dataSource.getRepository).not.toHaveBeenCalled();
    expect(cache.setJson).not.toHaveBeenCalled();
  });

  it("falls back to the database when Redis is unavailable", async () => {
    const { dataSource, query } = createDatabase([]);
    const cache = new DoctorCacheService();
    const service = new DoctorSearchService(dataSource, cache);

    await expect(service.search({ page: 1, limit: 10 })).resolves.toEqual({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    expect(dataSource.getRepository).toHaveBeenCalledWith(DoctorEntity);
    expect(query.getMany).toHaveBeenCalled();
    expect(cache.stats()).toEqual({ hits: 0, misses: 1, hitRate: 0 });
  });
});
