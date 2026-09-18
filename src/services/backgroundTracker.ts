/**
 * Background Tracking Service
 * 
 * Provides solutions to allow GPS tracking and timer updates to continue 
 * even when the mobile phone screen is locked / turned off:
 * 
 * 1. Screen Wake Lock API (prevents the screen from automatically sleeping/dimming while driving)
 * 2. Background Silent Audio Keep-Alive (utilizes the OS media playback background execution privilege
 *    on iOS Safari and Android Chrome to keep JavaScript execution and Geolocation alive when the user locks the screen)
 * 3. Visibility Change Reconnection & Recovery (re-acquires locks and forces GPS reading upon resume)
 */

import { GpsPoint } from '../types';

// 1-second silent WAV file base64 data URI
const SILENT_WAV_BASE64 = 
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

class BackgroundTrackerService {
  private wakeLock: any = null;
  private audioEl: HTMLAudioElement | null = null;
  private isBackgroundAudioActive: boolean = false;
  private fallbackInterval: any = null;
  private onGpsCallback: ((point: GpsPoint) => void) | null = null;
  private lastPointTime: number = Date.now();
  private pointSeq: number = 1000;
  private isPowerSaving: boolean = false;
  private currentIntervalMs: number = 4000;

  constructor() {
    // Listen to visibility changes (e.g. screen unlock / app switch)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // Re-acquire wake lock if it was released by OS
          this.reacquireWakeLock();
          // Immediately trigger a high accuracy GPS poll to close any gap
          this.forceGpsPoll();
        }
      });
    }
  }

  /**
   * Request Screen Wake Lock to keep the display awake during driving
   */
  async requestWakeLock(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Re-acquire Screen Wake Lock if still needed
   */
  private async reacquireWakeLock() {
    if (!this.wakeLock) {
      await this.requestWakeLock();
    }
  }

  /**
   * Release Screen Wake Lock
   */
  releaseWakeLock(): void {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {
        // ignore
      }
      this.wakeLock = null;
    }
  }

  /**
   * Start the Background Audio Loop Keep-Alive.
   * On iOS Safari and Android Chrome, having an active media playback session
   * prevents the browser tab from being frozen when the user locks their screen.
   */
  startBackgroundAudio(): boolean {
    try {
      if (!this.audioEl) {
        this.audioEl = new Audio(SILENT_WAV_BASE64);
        this.audioEl.loop = true;
        this.audioEl.volume = 0.01;
        (this.audioEl as any).playsInline = true;
      }

      this.audioEl.play().then(() => {
        this.isBackgroundAudioActive = true;
      }).catch((err) => {
        console.warn('Audio play restricted until user gesture:', err);
      });

      // Set Media Session metadata so it shows in phone lock screen controls
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Car Trip Tracker - กำลังบันทึกทริป',
          artist: 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง',
          album: 'ระบบติดตามเส้นทาง (ทำงานเบื้องหลังขณะปิดจอ)',
        });

        navigator.mediaSession.setActionHandler('play', () => {
          this.audioEl?.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.audioEl?.play(); // Keep playing silent loop to prevent freeze
        });
      }

      return true;
    } catch (e) {
      console.warn('Error starting background audio keepalive:', e);
      return false;
    }
  }

  /**
   * Stop Background Audio Keep-Alive
   */
  stopBackgroundAudio(): void {
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
      } catch (e) {
        // ignore
      }
      this.isBackgroundAudioActive = false;
    }
  }

  /**
   * Set Power Saving Mode dynamically
   * When enabled, polling interval is relaxed (e.g. 12000ms instead of 4000ms)
   * and high-accuracy GPS usage is throttled to conserve battery.
   */
  setPowerSavingMode(enabled: boolean, intervalSeconds: number = 12): void {
    this.isPowerSaving = enabled;
    this.currentIntervalMs = enabled ? Math.max(8000, intervalSeconds * 1000) : 4000;
    
    // If polling is active, restart interval with new timing
    if (this.fallbackInterval && this.onGpsCallback) {
      const cb = this.onGpsCallback;
      this.startPeriodicGpsPoll(cb, this.currentIntervalMs);
    }
  }

  /**
   * Start Periodic GPS Polling Fallback (ensures points continue to be requested even if watchPosition slows down)
   */
  startPeriodicGpsPoll(onPoint: (point: GpsPoint) => void, intervalMs?: number) {
    this.onGpsCallback = onPoint;
    this.stopPeriodicGpsPoll();

    const interval = intervalMs || this.currentIntervalMs;
    this.currentIntervalMs = interval;

    this.fallbackInterval = setInterval(() => {
      this.forceGpsPoll();
    }, interval);
  }

  stopPeriodicGpsPoll() {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    this.onGpsCallback = null;
  }

  /**
   * Force an immediate GPS poll
   */
  forceGpsPoll() {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !this.onGpsCallback) {
      return;
    }

    // In power saving mode, deduplicate within a longer window (e.g. 6 seconds vs 1.5 seconds)
    const minDedupeWindow = this.isPowerSaving ? 6000 : 1500;
    const now = Date.now();
    if (now - this.lastPointTime < minDedupeWindow) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, speed, heading, accuracy, altitude } = pos.coords;
        const currentNow = Date.now();
        if (currentNow - this.lastPointTime < minDedupeWindow) return;
        this.lastPointTime = currentNow;

        const spKmh = speed ? Math.round(speed * 3.6) : 0;
        this.pointSeq += 1;
        const pt: GpsPoint = {
          seq: this.pointSeq,
          lat: latitude,
          lng: longitude,
          speed: spKmh,
          bearing: heading || 0,
          accuracy: accuracy || null,
          altitude: altitude || null,
          ts: new Date().toISOString(),
          syncStatus: 0,
        };

        if (this.onGpsCallback) {
          this.onGpsCallback(pt);
        }
      },
      (err) => {
        // silent fail on GPS timeout in tunnel/indoor
      },
      {
        enableHighAccuracy: !this.isPowerSaving,
        timeout: this.isPowerSaving ? 10000 : 5000,
        maximumAge: this.isPowerSaving ? 10000 : 3000,
      }
    );
  }

  /**
   * Fully start all background tracking mechanisms
   */
  startAll(onPoint: (point: GpsPoint) => void, isPowerSaving: boolean = false, intervalSeconds: number = 12) {
    this.isPowerSaving = isPowerSaving;
    this.currentIntervalMs = isPowerSaving ? Math.max(8000, intervalSeconds * 1000) : 4000;
    this.requestWakeLock();
    this.startBackgroundAudio();
    this.startPeriodicGpsPoll(onPoint, this.currentIntervalMs);
  }

  /**
   * Fully stop all background tracking mechanisms
   */
  stopAll() {
    this.releaseWakeLock();
    this.stopBackgroundAudio();
    this.stopPeriodicGpsPoll();
  }

  get isAudioActive() {
    return this.isBackgroundAudioActive;
  }

  get hasWakeLock() {
    return Boolean(this.wakeLock);
  }
}

export const backgroundTracker = new BackgroundTrackerService();
