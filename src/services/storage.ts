import { Trip, ActiveTripState, GpsPoint, GasConfig, SyncQueueItem, MonthlySummary, Vehicle } from '../types';

const STORAGE_KEYS = {
  TRIPS: 'CTT_TRIPS_V5',
  ACTIVE: 'CTT_ACTIVE_TRIP_V5',
  TRACK: 'CTT_TRACK_POINTS_V5',
  CONFIG: 'CTT_GAS_CONFIG_V5',
  QUEUE: 'CTT_SYNC_QUEUE_V5',
  DRIVERS: 'CTT_DRIVERS_V5',
  VEHICLES: 'CTT_VEHICLES_V5',
  INITIALIZED_REAL: 'CTT_INITIALIZED_REAL_V5',
};

// Seed sample data for high visual appeal and immediate testability
const SAMPLE_DRIVERS = ['นายมูฮัมหมัด เจะมะ'];

const SAMPLE_VEHICLES: Vehicle[] = [];

const SAMPLE_TRIPS: Trip[] = [];

export const storage = {
  getTrips(): Trip[] {
    try {
      const cleaned = localStorage.getItem('CTT_CLEANED_DATA_V9');
      if (!cleaned) {
        localStorage.removeItem(STORAGE_KEYS.TRIPS);
        localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(SAMPLE_DRIVERS));
        localStorage.setItem('CTT_CLEANED_DATA_V9', 'true');
      }

      // Ensure vehicles are empty if any legacy sample vehicles are present
      try {
        const vData = localStorage.getItem(STORAGE_KEYS.VEHICLES);
        if (vData) {
          const parsed = JSON.parse(vData);
          if (Array.isArray(parsed) && parsed.some(v => v.licensePlate?.includes('4กข') || v.id === 'v1')) {
            localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
          }
        }
      } catch (e) {
        // ignore
      }

      const data = localStorage.getItem(STORAGE_KEYS.TRIPS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(SAMPLE_TRIPS));
        return SAMPLE_TRIPS;
      }
      return JSON.parse(data) || [];
    } catch {
      return SAMPLE_TRIPS;
    }
  },

  saveTrips(trips: Trip[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
      this.pushToServer();
    } catch (e) {
      console.error('Failed to save trips to localStorage:', e);
    }
  },

  addTrip(trip: Trip): void {
    const trips = this.getTrips();
    const existingIdx = trips.findIndex(t => t.tripId === trip.tripId);
    if (existingIdx >= 0) {
      trips[existingIdx] = trip;
    } else {
      trips.unshift(trip);
    }
    this.saveTrips(trips);
  },

  deleteTrip(tripId: string): void {
    const trips = this.getTrips().filter(t => t.tripId !== tripId);
    this.saveTrips(trips);
  },

  updateTrip(trip: Trip): void {
    const trips = this.getTrips();
    const idx = trips.findIndex(t => t.tripId === trip.tripId);
    if (idx >= 0) {
      trips[idx] = trip;
      this.saveTrips(trips);
    }
  },

  getActiveTrip(): ActiveTripState | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveActiveTrip(state: ActiveTripState | null): void {
    try {
      if (state) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE, JSON.stringify(state));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE);
      }
    } catch (e) {
      console.error('Failed to save active trip:', e);
    }
  },

  getTrackPoints(): GpsPoint[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRACK);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveTrackPoints(points: GpsPoint[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRACK, JSON.stringify(points));
    } catch (e) {
      console.error('Failed to save track points:', e);
    }
  },

  clearTrackPoints(): void {
    localStorage.removeItem(STORAGE_KEYS.TRACK);
  },

  getDrivers(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRIVERS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(SAMPLE_DRIVERS));
        return SAMPLE_DRIVERS;
      }
      return JSON.parse(data) || SAMPLE_DRIVERS;
    } catch {
      return SAMPLE_DRIVERS;
    }
  },

  addDriver(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const drivers = this.getDrivers();
    if (!drivers.includes(trimmed)) {
      drivers.push(trimmed);
      localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
    }
  },

  getGasConfig(): GasConfig {
    const defaultConfig: GasConfig = {
      scriptUrl: '/api/gas',
      apiKey: 'CTT-ONLINE-AUTO-KEY-2026',
      enabled: true,
      autoSync: true,
      isConnected: true,
      version: 'V5.3.9-Cloud',
    };
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(defaultConfig));
        return defaultConfig;
      }
      const parsed = JSON.parse(data);
      return {
        ...defaultConfig,
        ...parsed,
        enabled: parsed.enabled !== undefined ? parsed.enabled : true,
        scriptUrl: parsed.scriptUrl || '/api/gas',
        isConnected: true,
      };
    } catch {
      return defaultConfig;
    }
  },

  saveGasConfig(config: GasConfig): void {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    this.pushToServer();
  },

  async syncWithServer(): Promise<boolean> {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (data.trips && Array.isArray(data.trips)) {
            localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(data.trips));
          }
          if (data.vehicles && Array.isArray(data.vehicles)) {
            localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(data.vehicles));
          }
          if (data.drivers && Array.isArray(data.drivers)) {
            localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(data.drivers));
          }
          if (data.gasConfig) {
            const current = this.getGasConfig();
            localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({ ...current, ...data.gasConfig, enabled: true }));
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Sync with server warning:', e);
    }
    return false;
  },

  async pushToServer(): Promise<void> {
    try {
      const trips = this.getTrips();
      const vehicles = this.getVehicles();
      const drivers = this.getDrivers();
      const gasConfig = this.getGasConfig();
      const queue = this.getSyncQueue();

      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trips, vehicles, drivers, gasConfig, queue }),
      });
    } catch (e) {
      console.warn('Push to server warning:', e);
    }
  },

  getSyncQueue(): SyncQueueItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.QUEUE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveSyncQueue(queue: SyncQueueItem[]): void {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
  },

  enqueueSync(action: 'start' | 'track_batch' | 'end', payload: Record<string, any>, tripId?: string | null): void {
    const queue = this.getSyncQueue();
    const item: SyncQueueItem = {
      action,
      requestId: payload.requestId || `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tripId,
      payload,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    queue.push(item);
    this.saveSyncQueue(queue);
  },

  getMonthlySummaries(): MonthlySummary[] {
    const trips = this.getTrips().filter(t => t.status === 'COMPLETED');
    const map = new Map<string, MonthlySummary>();

    for (const trip of trips) {
      const date = trip.endTs || trip.startTs;
      const month = date ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
      const key = `${month}_${trip.driver}`;

      const distance = Number(trip.matchedDistanceKm || trip.odoDistanceKm || trip.gpsDistanceKm || 0);
      const odoKm = Number(trip.odoDistanceKm || 0);
      const fuel = Number(trip.fuel || 0);
      const toll = Number(trip.toll || 0);
      const parking = Number(trip.parking || 0);
      const total = Number(trip.totalExpense || fuel + toll + parking);

      if (!map.has(key)) {
        map.set(key, {
          month,
          driver: trip.driver,
          tripCount: 1,
          distanceKm: distance,
          odoDistanceKm: odoKm,
          fuel,
          toll,
          parking,
          totalExpense: total,
          updatedAt: trip.lastUpdated || trip.createdAt,
        });
      } else {
        const cur = map.get(key)!;
        cur.tripCount += 1;
        cur.distanceKm = Math.round((cur.distanceKm + distance) * 10) / 10;
        cur.odoDistanceKm += odoKm;
        cur.fuel += fuel;
        cur.toll += toll;
        cur.parking += parking;
        cur.totalExpense += total;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  },

  getVehicles(): Vehicle[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VEHICLES);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
        return [];
      }
      return JSON.parse(data) || [];
    } catch {
      return [];
    }
  },

  saveVehicles(vehicles: Vehicle[]): void {
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  },

  addVehicle(vehicle: Vehicle): void {
    const list = this.getVehicles();
    const existing = list.findIndex(v => v.licensePlate === vehicle.licensePlate || v.id === vehicle.id);
    if (existing >= 0) {
      list[existing] = vehicle;
    } else {
      list.push(vehicle);
    }
    this.saveVehicles(list);
  },

  updateVehicleOdometer(licensePlate: string, newOdo: number): void {
    const list = this.getVehicles();
    const v = list.find(item => item.licensePlate === licensePlate);
    if (v && newOdo > v.currentOdo) {
      v.currentOdo = newOdo;
      this.saveVehicles(list);
    }
  },

  isDemoMode(): boolean {
    const trips = this.getTrips();
    return trips.some(t => t.tripId.includes('TRIP-20260912'));
  },

  clearDemoTrips(): void {
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED_REAL, 'true');
  },

  loadSampleData(): void {
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(SAMPLE_TRIPS));
    localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(SAMPLE_DRIVERS));
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(SAMPLE_VEHICLES));
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED_REAL);
  },

  getLastOdometer(licensePlate?: string): number {
    if (licensePlate) {
      const vehicles = this.getVehicles();
      const v = vehicles.find(item => item.licensePlate === licensePlate);
      if (v && v.currentOdo > 0) return v.currentOdo;
    }

    const trips = this.getTrips();
    if (trips.length > 0) {
      for (const t of trips) {
        if (licensePlate && t.licensePlate && t.licensePlate !== licensePlate) continue;
        if (t.endOdo && t.endOdo > 0) return t.endOdo;
        if (t.startOdo && t.startOdo > 0) return t.startOdo;
      }
    }

    // Default to first vehicle or 0 if user cleared
    const vehicles = this.getVehicles();
    if (vehicles.length > 0 && vehicles[0].currentOdo > 0) {
      return vehicles[0].currentOdo;
    }
    return 0;
  },
};
