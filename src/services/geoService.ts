import { GpsPoint } from '../types';

const R_EARTH_KM = 6371;

/**
 * Calculates Haversine distance between two coordinates in kilometers
 */
export function haversineDistanceKm(
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined
): number {
  if (
    lat1 === null || lat1 === undefined || !isFinite(Number(lat1)) ||
    lon1 === null || lon1 === undefined || !isFinite(Number(lon1)) ||
    lat2 === null || lat2 === undefined || !isFinite(Number(lat2)) ||
    lon2 === null || lon2 === undefined || !isFinite(Number(lon2))
  ) {
    return 0;
  }

  const p1 = (Number(lat1) * Math.PI) / 180;
  const p2 = (Number(lat2) * Math.PI) / 180;
  const dp = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dl = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;

  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Computes total cumulative distance along an array of GpsPoints with jitter suppression
 */
export function calculateTrackDistanceKm(points: GpsPoint[], minThresholdMeters = 8): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  const thresholdKm = minThresholdMeters / 1000;

  for (let i = 1; i < points.length; i++) {
    if (points[i].accuracy && points[i].accuracy! > 50) continue;

    const segmentKm = haversineDistanceKm(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );

    if (segmentKm >= thresholdKm) {
      total += segmentKm;
    }
  }

  return Math.round(total * 10) / 10;
}

/**
 * Calls OpenStreetMap OSRM road routing engine for real driving road distance and high-resolution road geometry (overview=full)
 */
export async function fetchOsrmRoadDistance(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  waypoints?: { lat: number; lng: number }[]
): Promise<{ distanceKm: number; durationMin: number; geometry?: [number, number][] } | null> {
  const directKm = haversineDistanceKm(startLat, startLng, endLat, endLng);
  if (directKm < 0.03) {
    return { distanceKm: 0, durationMin: 0 };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const coordsParts = [`${startLng},${startLat}`];
    if (waypoints && waypoints.length > 0) {
      waypoints.forEach((wp) => {
        if (wp.lat && wp.lng) {
          coordsParts.push(`${wp.lng},${wp.lat}`);
        }
      });
    }
    coordsParts.push(`${endLng},${endLat}`);

    const url = `https://router.project-osrm.org/route/v1/driving/${coordsParts.join(';')}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        const durationMin = Math.round(route.duration / 60);
        // OSRM geometry is [lng, lat], convert to [lat, lng]
        const geometry: [number, number][] =
          route.geometry?.coordinates?.map((c: [number, number]) => [c[1], c[0]]) || [];
        return { distanceKm, durationMin, geometry };
      }
    }
  } catch (err) {
    console.warn('OSRM routing fetch warning (using fallback):', err);
  }

  return null;
}

// In-memory geocode cache
const geoCache = new Map<string, string>();

/**
 * Reverse geocodes latitude/longitude to readable address using OpenStreetMap Nominatim
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geoCache.has(key)) {
    return geoCache.get(key)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'th,en',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const road = addr.road || addr.suburb || addr.neighbourhood || '';
      const district = addr.city_district || addr.district || addr.amphoe || addr.city || '';
      const province = addr.state || addr.province || '';
      
      const parts = [road, district, province].filter(Boolean);
      const formatted = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      
      geoCache.set(key, formatted);
      return formatted;
    }
  } catch (err) {
    // Silent catch, fallback to coordinates
  }

  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  geoCache.set(key, fallback);
  return fallback;
}

/**
 * Generates an interpolated next GPS waypoint along a realistic route for simulation
 */
export function simulateNextPosition(
  currentLat: number,
  currentLng: number,
  bearingDeg: number,
  speedKmh: number,
  deltaSec: number = 3
): { lat: number; lng: number; speed: number; bearing: number } {
  const jitter = (Math.random() - 0.5) * 8;
  const newBearing = (bearingDeg + jitter + 360) % 360;
  
  const distanceKm = (speedKmh * deltaSec) / 3600;
  
  const rad = (newBearing * Math.PI) / 180;
  const latRad = (currentLat * Math.PI) / 180;
  const lngRad = (currentLng * Math.PI) / 180;
  const angularDist = distanceKm / R_EARTH_KM;

  const nextLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(rad)
  );

  const nextLngRad =
    lngRad +
    Math.atan2(
      Math.sin(rad) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(nextLatRad)
    );

  const nextLat = (nextLatRad * 180) / Math.PI;
  const nextLng = (nextLngRad * 180) / Math.PI;

  return {
    lat: Math.round(nextLat * 100000) / 100000,
    lng: Math.round(nextLng * 100000) / 100000,
    speed: Math.max(10, Math.min(110, Math.round(speedKmh + (Math.random() - 0.5) * 5))),
    bearing: Math.round(newBearing),
  };
}

/**
 * Formats duration in minutes to HH:MM:SS or Thai string
 */
export function formatDuration(durationMinutes: number): string {
  if (!durationMinutes || isNaN(durationMinutes)) return '0 นาที';
  const totalSec = Math.round(durationMinutes * 60);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `${hours} ชม. ${mins} นาที`;
  }
  return `${mins} นาที ${secs} วินาที`;
}

/**
 * Formats timestamp to Thai date only (e.g. 17 ก.ย. 2569)
 */
export function formatThaiDate(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(isoString);
  }
}

/**
 * Formats timestamp to Thai display format
 */
export function formatThaiDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}
