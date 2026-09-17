/**
 * Car Trip Tracker Canonical Types
 * Strict adherence to the V5.3.9 37-column contract and Apps Script integration
 */

export type TripStatus = 'PROGRESS' | 'ENDING' | 'COMPLETED';

export type DistanceSource = 'GEOAPIFY' | 'OSRM' | 'HAVERSINE_FALLBACK' | 'LOCAL' | 'MANUAL';

export interface GpsPoint {
  seq: number;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  altitude?: number | null;
  ts: string;
  syncStatus?: 0 | 1 | 2; // 0=unsynced, 1=synced/accepted, 2=rejected
}

export interface Waypoint {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  ts: string;
  note?: string;
}

export interface Vehicle {
  id: string;
  licensePlate: string;
  name: string; // e.g. "Toyota Fortuner"
  currentOdo: number;
  fuelType?: string;
  isDefault?: boolean;
}

export interface ReceiptItem {
  id: string;
  slot: number;
  name?: string;
  mimeType: string;
  data: string; // Base64 or Blob URL
  url?: string;
}

export interface Trip {
  tripId: string;
  status: TripStatus;
  generation?: number;
  startRequestId?: string;
  endRequestId?: string;
  endStartedAt?: string;
  seqRanges?: string;
  driver: string;
  vehicle?: string;
  licensePlate?: string;
  purpose: string;
  startOdo: number;
  endOdo?: number | null;
  odoDistanceKm?: number | null;
  gpsDistanceKm?: number | null;
  matchedDistanceKm?: number | null;
  distanceSource?: DistanceSource | string;
  providerMetadata?: string;
  startTs: string;
  endTs?: string | null;
  durationMin?: number;
  startLat?: number | null;
  startLng?: number | null;
  startAddress?: string;
  endLat?: number | null;
  endLng?: number | null;
  endAddress?: string;
  waypoints?: Waypoint[];
  pointCount: number;
  fuel: number;
  toll: number;
  parking: number;
  totalExpense: number;
  receiptUrls?: string[] | string;
  receiptCount: number;
  receipts?: ReceiptItem[];
  startNote?: string;
  endNote?: string;
  note?: string;
  createdAt: string;
  lastUpdated: string;
  points?: GpsPoint[];
}

export interface ActiveTripState {
  tripId: string | null;
  startRequestId: string;
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
  waypoints?: Waypoint[];
  isPaused?: boolean;
  pausedAt?: string | null;
  accumulatedPauseSec?: number;
  seq: number;
  sentSeq: number;
  pendingBatchId: string | null;
  pendingBatchSeqs?: number[];
  state: 'ACTIVE' | 'PENDING_END';
}

export interface MonthlySummary {
  month: string; // 'YYYY-MM'
  driver: string;
  tripCount: number;
  distanceKm: number;
  odoDistanceKm: number;
  fuel: number;
  toll: number;
  parking: number;
  totalExpense: number;
  updatedAt?: string;
}

export interface GasConfig {
  scriptUrl: string;
  spreadsheetUrl?: string;
  apiKey: string;
  enabled: boolean;
  autoSync: boolean;
  lastChecked?: string;
  isConnected: boolean;
  version?: string;
}

export interface SyncQueueItem {
  action: 'start' | 'track_batch' | 'end';
  requestId: string;
  tripId?: string | null;
  payload: Record<string, any>;
  createdAt: string;
  retries: number;
  error?: string;
}

export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
}
