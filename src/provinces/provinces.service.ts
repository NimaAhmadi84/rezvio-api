import { Injectable } from '@nestjs/common';
import {
  IRAN_PROVINCES,
  getAllProvinceNames,
  getCitiesByProvince,
  getProvinceById,
} from './data/iran-provinces';

@Injectable()
export class ProvincesService {
  /**
   * دریافت لیست همه استان‌ها با شهرهایشان
   */
  getAllProvinces() {
    return IRAN_PROVINCES;
  }

  /**
   * دریافت لیست نام استان‌ها (بدون شهرها - برای dropdown)
   */
  getProvinceNames() {
    return getAllProvinceNames();
  }

  /**
   * دریافت شهرهای یک استان خاص
   */
  getCitiesByProvince(provinceName: string) {
    const cities = getCitiesByProvince(provinceName);
    if (!cities || cities.length === 0) {
      return [];
    }
    return cities;
  }

  /**
   * دریافت استان بر اساس ID
   */
  getProvinceById(id: string) {
    return getProvinceById(id);
  }
}
