import { GpsPoint, LiveFleetVehicle, ActiveTripState } from '../types';

export type RealtimeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RealtimePresence {
  connectedAdmins: number;
  activeVehiclesCount: number;
  serverTime: string;
}

export interface RealtimeLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'trip';
  vehicle?: string;
}

class RealtimeService {
  private ws: WebSocket | null = null;
  private status: RealtimeConnectionStatus = 'disconnected';
  private isAdminMode: boolean = false;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private pollInterval: any = null;
  private pingStartTime: number = 0;
  private latencyMs: number = 0;

  private fleet: Map<string, LiveFleetVehicle> = new Map();
  private presence: RealtimePresence = {
    connectedAdmins: 0,
    activeVehiclesCount: 0,
    serverTime: new Date().toISOString(),
  };

  private fleetListeners = new Set<(vehicles: LiveFleetVehicle[]) => void>();
  private statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
  private presenceListeners = new Set<(presence: RealtimePresence) => void>();
  private logListeners = new Set<(log: RealtimeLogEntry) => void>();
  private logs: RealtimeLogEntry[] = [];

  constructor() {
    // Try to restore any active local tracker connection
  }

  // --- Listener Registrations ---
  public onFleetUpdate(cb: (vehicles: LiveFleetVehicle[]) => void): () => void {
    this.fleetListeners.add(cb);
    cb(Array.from(this.fleet.values()));
    return () => this.fleetListeners.delete(cb);
  }

  public onStatusChange(cb: (status: RealtimeConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public onPresenceChange(cb: (presence: RealtimePresence) => void): () => void {
    this.presenceListeners.add(cb);
    cb(this.presence);
    return () => this.presenceListeners.delete(cb);
  }

  public onLog(cb: (log: RealtimeLogEntry) => void): () => void {
    this.logListeners.add(cb);
    return () => this.logListeners.delete(cb);
  }

  public getLogs(): RealtimeLogEntry[] {
    return [...this.logs];
  }

  public getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  public getLatency(): number {
    return this.latencyMs;
  }

  public getFleet(): LiveFleetVehicle[] {
    return Array.from(this.fleet.values());
  }

  public getPresence(): RealtimePresence {
    return this.presence;
  }

  private addLog(message: string, type: 'info' | 'success' | 'warning' | 'trip' = 'info', vehicle?: string) {
    const entry: RealtimeLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('th-TH'),
      message,
      type,
      vehicle,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 80) this.logs.pop();
    this.logListeners.forEach(cb => cb(entry));
  }

  private notifyFleet() {
    const list = Array.from(this.fleet.values());
    this.fleetListeners.forEach(cb => cb(list));
  }

  private notifyStatus(s: RealtimeConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach(cb => cb(s));
  }

  private notifyPresence(p: RealtimePresence) {
    this.presence = p;
    this.presenceListeners.forEach(cb => cb(p));
  }

  // --- Admin Connection Management ---
  public connectAdmin() {
    this.isAdminMode = true;
    this.initWebSocket(true);
  }

  public disconnectAdmin() {
    this.isAdminMode = false;
    this.cleanupWebSocket();
    this.stopPolling();
    this.notifyStatus('disconnected');
    this.addLog('แอดมินตัดการเชื่อมต่อระบบเรียลไทม์แล้ว', 'info');
  }

  private getWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  private initWebSocket(asAdmin: boolean) {
    this.cleanupWebSocket();
    this.notifyStatus('connecting');
    this.addLog('กำลังเชื่อมต่อเซิร์ฟเวอร์เรียลไทม์...', 'info');

    try {
      const url = this.getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.notifyStatus('connected');
        this.addLog('เชื่อมต่อระบบออนไลน์เรียลไทม์สำเร็จ! (WebSocket Live)', 'success');
        this.stopPolling();

        if (asAdmin) {
          this.send({ type: 'admin:connect', adminName: 'Admin Monitor' });
        }

        // Start ping heartbeat
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.warn('Error parsing WS message:', e);
        }
      };

      this.ws.onclose = () => {
        if (this.status === 'connected') {
          this.addLog('การเชื่อมต่อ WebSocket ถูกตัด กำลังเชื่อมต่อใหม่...', 'warning');
        }
        this.notifyStatus('disconnected');
        this.stopPing();

        // If admin is active, auto-reconnect or fallback to HTTP polling
        if (this.isAdminMode) {
          this.startPollingFallback();
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
        this.notifyStatus('error');
        this.startPollingFallback();
      };
    } catch (err) {
      console.warn('Failed to construct WebSocket:', err);
      this.notifyStatus('error');
      this.startPollingFallback();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.isAdminMode && this.status !== 'connected') {
        this.initWebSocket(true);
      }
    }, 4000);
  }

  private cleanupWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN && this.isAdminMode) {
          this.send({ type: 'admin:disconnect' });
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pingStartTime = Date.now();
        this.send({ type: 'ping' });
      }
    }, 8000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // --- Polling fallback (Ensures zero-fail live view even in strict iframe proxies) ---
  private startPollingFallback() {
    if (this.pollInterval) return;
    this.pollFleetSnapshot();
    this.pollInterval = setInterval(() => {
      if (this.isAdminMode) {
        this.pollFleetSnapshot();
      }
    }, 3000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public async pollFleetSnapshot() {
    try {
      const res = await fetch('/api/live/fleet');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.activeTrips)) {
          this.fleet.clear();
          data.activeTrips.forEach((v: LiveFleetVehicle) => {
            this.fleet.set(v.tripId, v);
          });
          this.notifyFleet();
          this.notifyPresence({
            connectedAdmins: data.connectedAdmins || (this.isAdminMode ? 1 : 0),
            activeVehiclesCount: data.activeTrips.length,
            serverTime: data.serverTime || new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      // ignore transient network glitch
    }
  }

  private handleServerMessage(data: any) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'init:fleet': {
        this.fleet.clear();
        if (Array.isArray(data.activeTrips)) {
          data.activeTrips.forEach((v: LiveFleetVehicle) => {
            this.fleet.set(v.tripId, v);
          });
        }
        this.notifyFleet();
        this.notifyPresence({
          connectedAdmins: data.connectedAdmins || 1,
          activeVehiclesCount: this.fleet.size,
          serverTime: data.serverTime || new Date().toISOString(),
        });
        this.addLog(`ซิงค์ข้อมูลยานพาหนะสำเร็จ (พบรถในระบบ ${this.fleet.size} คัน)`, 'info');
        break;
      }

      case 'fleet:trip_started': {
        const trip: LiveFleetVehicle = data.trip;
        if (trip && trip.tripId) {
          this.fleet.set(trip.tripId, trip);
          this.notifyFleet();
          this.addLog(
            `🚀 รถออกเดินทาง: ${trip.vehicle} (${trip.licensePlate}) ขับโดย ${trip.driver}`,
            'trip',
            trip.vehicle
          );
        }
        break;
      }

      case 'fleet:point_update': {
        const { tripId, lat, lng, speed, bearing, lastAddress, pointsCount, lastUpdated } = data;
        const vehicle = this.fleet.get(tripId);
        if (vehicle) {
          vehicle.currentLat = lat;
          vehicle.currentLng = lng;
          vehicle.currentSpeed = speed;
          vehicle.currentBearing = bearing;
          if (lastAddress) vehicle.lastAddress = lastAddress;
          vehicle.pointsCount = pointsCount || vehicle.pointsCount + 1;
          vehicle.lastUpdated = lastUpdated || new Date().toISOString();
          if (!vehicle.pointsTrail) vehicle.pointsTrail = [];
          vehicle.pointsTrail.push({ lat, lng });
          if (vehicle.pointsTrail.length > 100) vehicle.pointsTrail.shift();
          this.notifyFleet();

          if (vehicle.pointsCount % 5 === 0) {
            this.addLog(
              `📍 ${vehicle.vehicle} (${vehicle.licensePlate}) ความเร็ว ${speed} กม./ชม. ${lastAddress ? 'ใกล้ ' + lastAddress : ''}`,
              'info',
              vehicle.vehicle
            );
          }
        }
        break;
      }

      case 'fleet:trip_paused': {
        const { tripId, isPaused } = data;
        const vehicle = this.fleet.get(tripId);
        if (vehicle) {
          vehicle.isPaused = isPaused;
          this.notifyFleet();
          this.addLog(
            isPaused
              ? `⏸️ รถหยุดพักชั่วคราว: ${vehicle.vehicle} (${vehicle.licensePlate})`
              : `▶️ รถออกวิ่งต่อ: ${vehicle.vehicle} (${vehicle.licensePlate})`,
            'warning',
            vehicle.vehicle
          );
        }
        break;
      }

      case 'fleet:trip_ended': {
        const { tripId } = data;
        const vehicle = this.fleet.get(tripId);
        if (vehicle) {
          this.addLog(
            `🏁 สิ้นสุดการเดินทาง: ${vehicle.vehicle} (${vehicle.licensePlate}) ขับโดย ${vehicle.driver}`,
            'success',
            vehicle.vehicle
          );
          this.fleet.delete(tripId);
          this.notifyFleet();
        }
        break;
      }

      case 'presence:update': {
        this.notifyPresence({
          connectedAdmins: data.connectedAdmins || 0,
          activeVehiclesCount: data.activeVehiclesCount || this.fleet.size,
          serverTime: data.serverTime || new Date().toISOString(),
        });
        break;
      }

      case 'pong': {
        if (this.pingStartTime > 0) {
          this.latencyMs = Math.max(1, Date.now() - this.pingStartTime);
        }
        break;
      }
    }
  }

  // --- Driver Broadcast Methods ---
  public send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        console.warn('WS send error:', e);
      }
    }
    return false;
  }

  public broadcastTripStart(activeTrip: ActiveTripState) {
    // Attempt WebSocket
    const sent = this.send({
      type: 'trip:start',
      trip: activeTrip,
    });

    // Also HTTP POST to ensure persistence and broadcast in backend
    fetch('/api/live/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: activeTrip.tripId,
        driver: activeTrip.driver,
        vehicle: activeTrip.vehicle,
        licensePlate: activeTrip.licensePlate,
        purpose: activeTrip.purpose,
        startOdo: activeTrip.startOdo,
        startTs: activeTrip.startTs,
        startLat: activeTrip.startLat,
        startLng: activeTrip.startLng,
        startAddress: activeTrip.startAddress,
      }),
    }).catch(() => {});
  }

  public broadcastTripPoint(tripId: string, point: GpsPoint, address?: string) {
    // Attempt WebSocket
    const sent = this.send({
      type: 'trip:point',
      tripId,
      point,
      address,
    });

    // Also send via HTTP if WS not connected
    if (!sent) {
      fetch('/api/live/point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          lat: point.lat,
          lng: point.lng,
          speed: point.speed || 0,
          bearing: point.bearing || 0,
          address,
        }),
      }).catch(() => {});
    }
  }

  public broadcastTripPause(tripId: string, isPaused: boolean) {
    this.send({
      type: 'trip:pause',
      tripId,
      isPaused,
    });
  }

  public broadcastTripEnd(tripId: string) {
    this.send({
      type: 'trip:end',
      tripId,
    });

    fetch('/api/live/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId }),
    }).catch(() => {});
  }

  // --- Admin Simulation Helper (For instant testing of live real-time fleet map) ---
  private simulationInterval: any = null;
  public startDemoSimulation() {
    this.stopDemoSimulation();

    // Coordinates along Yaring to Pattani route
    const waypoints = [
      { lat: 6.8687, lng: 101.3688, address: 'ที่ว่าการอำเภอยะหริ่ง ถ.พิชิตบำรุง' },
      { lat: 6.8695, lng: 101.3621, address: 'แยกตลาดสดเทศบาลตำบลยะหริ่ง' },
      { lat: 6.8710, lng: 101.3550, address: 'สะพานคลองยะหริ่ง ถ.ทางหลวง 42' },
      { lat: 6.8725, lng: 101.3440, address: 'บ้านบาโงยลางา ถ.สาย 42' },
      { lat: 6.8740, lng: 101.3320, address: 'แยกดอนยาง ตะลุบัน' },
      { lat: 6.8755, lng: 101.3190, address: 'ปั๊ม ปตท. ยะหริ่ง ขาเข้าปัตตานี' },
      { lat: 6.8765, lng: 101.3050, address: 'โรงเรียนเบญจมราชูทิศ ปัตตานี' },
      { lat: 6.8690, lng: 101.2505, address: 'ศาลากลางจังหวัดปัตตานี' },
    ];

    let step = 0;
    const demoTripId = `DEMO-FLEET-${Date.now()}`;
    const startPoint = waypoints[0];

    // Register demo vehicle
    fetch('/api/live/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: demoTripId,
        driver: 'นายมูฮัมหมัด เจะมะ (รถจำลอง)',
        vehicle: 'Toyota Fortuner ราชการ',
        licensePlate: '4กข-8899 ยะลา',
        purpose: 'ทดสอบระบบติดตามดาวเทียมเรียลไทม์',
        startOdo: 125400,
        startLat: startPoint.lat,
        startLng: startPoint.lng,
        startAddress: startPoint.address,
      }),
    });

    this.simulationInterval = setInterval(() => {
      step = (step + 1) % waypoints.length;
      const target = waypoints[step];
      const speed = Math.floor(55 + Math.random() * 25);
      const bearing = Math.floor(260 + Math.random() * 20);

      fetch('/api/live/point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: demoTripId,
          lat: target.lat,
          lng: target.lng,
          speed,
          bearing,
          address: target.address,
        }),
      });

      if (step === waypoints.length - 1) {
        // reached end of loop, pause briefly
      }
    }, 3000);

    this.addLog('🚗 เริ่มต้นรถจำลองสด (Toyota Fortuner 4กข-8899) บนเส้นทางยะหริ่ง-ปัตตานี', 'trip');
  }

  public stopDemoSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      this.addLog('🛑 หยุดการจำลองรถวิ่งสดแล้ว', 'info');
    }
  }

  public isSimulating(): boolean {
    return this.simulationInterval !== null;
  }
}

export const realtimeService = new RealtimeService();
