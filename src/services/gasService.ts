import { storage } from './storage';
import { GpsPoint, ReceiptItem } from '../types';

export interface GasResponse<T = any> {
  ok: boolean;
  code?: string;
  message?: string;
  version?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

export const gasService = {
  /**
   * Helper to perform POST to the deployed Google Apps Script Web App
   */
  async callGasApi<T = any>(action: string, payload: Record<string, any> = {}): Promise<GasResponse<T>> {
    const config = storage.getGasConfig();
    if (!config.enabled || !config.scriptUrl) {
      return { ok: false, code: 'GAS_NOT_CONFIGURED', message: 'Google Apps Script URL is not configured' };
    }

    const envelope = {
      action,
      apiKey: config.apiKey || '',
      requestId: payload.requestId || `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(config.scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const json = await res.json();
      return json;
    } catch (err: any) {
      console.warn('GasApi fetch error:', err);
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        message: err.name === 'AbortError' ? 'หมดเวลาเชื่อมต่อ (Timeout)' : err.message || 'ไม่สามารถเชื่อมต่อ Google Apps Script ได้',
      };
    }
  },

  /**
   * Ping / Healthcheck the Google Apps Script deployment
   */
  async testConnection(): Promise<{ ok: boolean; message: string; version?: string; spreadsheet?: boolean; drive?: boolean }> {
    const res = await this.callGasApi('healthcheck');
    if (res.ok) {
      const config = storage.getGasConfig();
      config.isConnected = true;
      config.version = res.version || 'V5.3.9';
      config.lastChecked = new Date().toISOString();
      storage.saveGasConfig(config);
      return {
        ok: true,
        message: `เชื่อมต่อสำเร็จ! เวอร์ชัน: ${res.version || 'V5.3.9'} (ชีต: ${res.spreadsheet ? 'พร้อม' : 'ยังไม่ระบุ'}, ไดรฟ์: ${res.drive ? 'พร้อม' : 'ยังไม่ระบุ'})`,
        version: res.version,
        spreadsheet: res.spreadsheet,
        drive: res.drive,
      };
    }

    // Try fallback ping
    const pingRes = await this.callGasApi('ping');
    if (pingRes.ok) {
      const config = storage.getGasConfig();
      config.isConnected = true;
      config.version = pingRes.version || 'V5.3.9';
      config.lastChecked = new Date().toISOString();
      storage.saveGasConfig(config);
      return {
        ok: true,
        message: `เชื่อมต่อสำเร็จ! เวอร์ชัน: ${pingRes.version || 'V5.3.9'}`,
        version: pingRes.version,
      };
    }

    return {
      ok: false,
      message: res.message || res.error || 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบ URL หรือสิทธิ์การเข้าถึง Web App (Anyone)',
    };
  },

  /**
   * Initializes / pulls initial data from Google Sheets via Code.gs
   */
  async syncInitialData(): Promise<{ ok: boolean; tripCount?: number; message?: string }> {
    const res = await this.callGasApi('init');
    if (res.ok && res.trips) {
      // Merge with local trips without dropping locally created trips
      const localTrips = storage.getTrips();
      const serverTrips = res.trips;
      const map = new Map<string, any>();

      // Put server trips first
      serverTrips.forEach((t: any) => map.set(t.tripId, t));
      // Overwrite/preserve local trips if they have more recent info
      localTrips.forEach((t: any) => {
        if (!map.has(t.tripId)) {
          map.set(t.tripId, t);
        }
      });

      storage.saveTrips(Array.from(map.values()));
      
      if (res.drivers && Array.isArray(res.drivers)) {
        res.drivers.forEach((d: string) => storage.addDriver(d));
      }

      return { ok: true, tripCount: serverTrips.length };
    }
    return { ok: false, message: res.message || 'ไม่สามารถโหลดข้อมูลจากชีตได้' };
  },

  /**
   * Action: Start Trip on backend
   */
  async startTrip(payload: {
    requestId: string;
    driver: string;
    vehicle?: string;
    licensePlate?: string;
    purpose: string;
    startOdo: number;
    startTs: string;
    startLat: number | null;
    startLng: number | null;
    startAddress?: string;
    startNote?: string;
  }): Promise<{ ok: boolean; tripId?: string; message?: string }> {
    const config = storage.getGasConfig();
    if (!config.enabled || !config.scriptUrl) {
      // Local mode only
      return { ok: true, tripId: `LOCAL-${Date.now()}` };
    }

    const res = await this.callGasApi('start', payload);
    if (res.ok && res.tripId) {
      return { ok: true, tripId: res.tripId };
    }

    // Queue offline if failed
    storage.enqueueSync('start', payload);
    return {
      ok: false,
      message: res.message || 'บันทึกออฟไลน์แล้ว จะซิงก์อัตโนมัติเมื่อเชื่อมต่อเซิร์ฟเวอร์ได้',
    };
  },

  /**
   * Action: Track Batch
   */
  async trackBatch(tripId: string, points: GpsPoint[]): Promise<{ ok: boolean; accepted?: number }> {
    const config = storage.getGasConfig();
    if (!config.enabled || !config.scriptUrl) return { ok: true, accepted: points.length };

    const requestId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const res = await this.callGasApi('track_batch', {
      tripId,
      requestId,
      points,
    });

    if (res.ok) {
      return { ok: true, accepted: res.accepted };
    }

    storage.enqueueSync('track_batch', { tripId, requestId, points }, tripId);
    return { ok: false };
  },

  /**
   * Action: End Trip on backend
   */
  async endTrip(payload: {
    requestId: string;
    tripId: string;
    startRequestId?: string;
    endOdo: number;
    endTs: string;
    endLat: number | null;
    endLng: number | null;
    endAddress?: string;
    endNote?: string;
    fuel: number;
    toll: number;
    parking: number;
    receipts: ReceiptItem[];
    points: GpsPoint[];
  }): Promise<GasResponse> {
    const config = storage.getGasConfig();
    if (!config.enabled || !config.scriptUrl) {
      return { ok: true, tripId: payload.tripId };
    }

    const res = await this.callGasApi('end', payload);
    if (res.ok) {
      return res;
    }

    storage.enqueueSync('end', payload, payload.tripId);
    return {
      ok: false,
      message: res.message || 'ไม่สามารถส่งไปยังชีตได้ในขณะนี้ บันทึกแบบออฟไลน์ไว้เรียบร้อยแล้ว',
    };
  },

  /**
   * Flushes pending offline sync queue
   */
  async flushQueue(): Promise<{ processed: number; errors: number }> {
    const queue = storage.getSyncQueue();
    if (!queue.length) return { processed: 0, errors: 0 };

    let processed = 0;
    let errors = 0;
    const remaining: typeof queue = [];

    for (const item of queue) {
      const res = await this.callGasApi(item.action, item.payload);
      if (res.ok) {
        processed++;
      } else {
        errors++;
        item.retries++;
        item.error = res.message || 'Retry failed';
        if (item.retries < 5) {
          remaining.push(item);
        }
      }
    }

    storage.saveSyncQueue(remaining);
    return { processed, errors };
  },
};
