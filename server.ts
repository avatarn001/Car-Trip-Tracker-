import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory Real-time Live Fleet Store
interface LiveVehicleState {
  tripId: string;
  driver: string;
  vehicle: string;
  licensePlate: string;
  purpose: string;
  startOdo: number;
  startTs: string;
  lastUpdated: string;
  isPaused: boolean;
  currentLat: number;
  currentLng: number;
  currentSpeed: number;
  currentBearing: number;
  lastAddress?: string;
  pointsCount: number;
  pointsTrail: { lat: number; lng: number }[];
}

const activeLiveFleet = new Map<string, LiveVehicleState>();
const adminSockets = new Set<WebSocket>();
const allSockets = new Set<WebSocket>();

function broadcastToAdmins(message: any) {
  const payload = JSON.stringify(message);
  for (const client of adminSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (e) {
        console.warn('Failed to send to admin socket:', e);
      }
    }
  }
}

function broadcastPresence() {
  broadcastToAdmins({
    type: 'presence:update',
    connectedAdmins: adminSockets.size,
    activeVehiclesCount: activeLiveFleet.size,
    serverTime: new Date().toISOString(),
  });
}

// In-memory / JSON file data store for online persistence across devices
const DATA_FILE = path.join(process.cwd(), 'data.json');

interface AppData {
  trips: any[];
  vehicles: any[];
  drivers: string[];
  gasConfig: any;
  syncQueue: any[];
}

const DEFAULT_DRIVERS = ['นายมูฮัมหมัด เจะมะ'];
const DEFAULT_VEHICLES: any[] = [];

const DEFAULT_TRIPS: any[] = [];

function filterOutDemo(data: AppData): AppData {
  return {
    trips: (data.trips || []).filter(
      (t) =>
        !t.tripId?.includes('TRIP-20260912') &&
        !t.tripId?.includes('DEMO') &&
        !t.tripId?.includes('SAMPLE') &&
        !t.driver?.includes('สมชาย')
    ),
    vehicles: data.vehicles || DEFAULT_VEHICLES,
    drivers: (data.drivers || DEFAULT_DRIVERS).filter((d: string) => !d.includes('สมชาย')),
    gasConfig: data.gasConfig || { scriptUrl: '', apiKey: '', enabled: true, autoSync: true, isConnected: true, version: 'V5.3.9-Cloud' },
    syncQueue: data.syncQueue || [],
  };
}

function loadData(): AppData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return filterOutDemo(data);
    }
  } catch (e) {
    console.warn('Error reading data.json:', e);
  }
  return {
    trips: DEFAULT_TRIPS,
    vehicles: DEFAULT_VEHICLES,
    drivers: DEFAULT_DRIVERS,
    gasConfig: { scriptUrl: '', apiKey: '', enabled: true, autoSync: true, isConnected: true, version: 'V5.3.9-Cloud' },
    syncQueue: [],
  };
}

function saveData(data: AppData) {
  try {
    const clean = filterOutDemo(data);
    fs.writeFileSync(DATA_FILE, JSON.stringify(clean, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error writing data.json:', e);
  }
}

let db = loadData();
saveData(db);

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "V5.3.9-Cloud", online: true, timestamp: new Date().toISOString() });
});

// Full state sync endpoint
app.get("/api/state", (req, res) => {
  db = loadData();
  res.json({
    ok: true,
    trips: db.trips,
    vehicles: db.vehicles,
    drivers: db.drivers,
    gasConfig: db.gasConfig,
    queue: db.syncQueue,
  });
});

app.post("/api/state", (req, res) => {
  const { trips, vehicles, drivers, gasConfig, queue } = req.body;
  if (trips) db.trips = trips;
  if (vehicles) db.vehicles = vehicles;
  if (drivers) db.drivers = drivers;
  if (gasConfig) db.gasConfig = gasConfig;
  if (queue) db.syncQueue = queue;
  saveData(db);
  res.json({ ok: true });
});

// Clear demo data endpoint
app.post("/api/clear-demo", (req, res) => {
  db = filterOutDemo(db);
  for (const key of activeLiveFleet.keys()) {
    if (key.includes('DEMO') || key.includes('demo')) {
      activeLiveFleet.delete(key);
    }
  }
  saveData(db);
  broadcastToAdmins({ type: 'fleet:update', activeTrips: Array.from(activeLiveFleet.values()) });
  broadcastPresence();
  res.json({ ok: true, message: 'ลบข้อมูลเดโม่เรียบร้อยแล้ว' });
});

// GAS compatible endpoint for zero-configuration online cloud sync
app.post("/api/gas", (req, res) => {
  const body = req.body || {};
  const action = body.action;

  db = loadData();

  if (action === 'healthcheck' || action === 'ping') {
    return res.json({
      ok: true,
      version: 'V5.3.9-Cloud',
      spreadsheet: true,
      drive: true,
      message: 'Cloud Online Backend Active',
    });
  }

  if (action === 'init') {
    return res.json({
      ok: true,
      trips: db.trips,
      drivers: db.drivers,
      vehicles: db.vehicles,
    });
  }

  if (action === 'start') {
    const newTrip = {
      tripId: body.tripId || `TRIP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'PROGRESS',
      driver: body.driver,
      vehicle: body.vehicle,
      licensePlate: body.licensePlate,
      purpose: body.purpose,
      startOdo: body.startOdo,
      startTs: body.startTs || new Date().toISOString(),
      startLat: body.startLat,
      startLng: body.startLng,
      startAddress: body.startAddress,
      startNote: body.startNote,
      pointCount: 0,
      fuel: 0,
      toll: 0,
      parking: 0,
      totalExpense: 0,
      receiptCount: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      points: [],
    };
    db.trips.unshift(newTrip);
    saveData(db);

    // Also register in real-time activeLiveFleet
    const liveVehicle: LiveVehicleState = {
      tripId: newTrip.tripId,
      driver: newTrip.driver || 'ผู้ขับขี่',
      vehicle: newTrip.vehicle || 'รถยนต์ราชการ',
      licensePlate: newTrip.licensePlate || '',
      purpose: newTrip.purpose || 'ไปราชการ',
      startOdo: newTrip.startOdo || 0,
      startTs: newTrip.startTs,
      lastUpdated: newTrip.lastUpdated,
      isPaused: false,
      currentLat: newTrip.startLat || 6.8687,
      currentLng: newTrip.startLng || 101.3688,
      currentSpeed: 0,
      currentBearing: 0,
      lastAddress: newTrip.startAddress || 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง',
      pointsCount: 1,
      pointsTrail: [{ lat: newTrip.startLat || 6.8687, lng: newTrip.startLng || 101.3688 }],
    };
    activeLiveFleet.set(newTrip.tripId, liveVehicle);
    broadcastToAdmins({ type: 'fleet:trip_started', trip: liveVehicle });
    broadcastPresence();

    return res.json({ ok: true, tripId: newTrip.tripId, message: 'Trip started successfully on Cloud' });
  }

  if (action === 'track_batch') {
    const { tripId, points } = body;
    const trip = db.trips.find(t => t.tripId === tripId);
    if (trip) {
      if (!trip.points) trip.points = [];
      if (Array.isArray(points)) {
        trip.points.push(...points);
        trip.pointCount = trip.points.length;
      }
      trip.lastUpdated = new Date().toISOString();
      saveData(db);

      // Update live fleet
      const vehicle = activeLiveFleet.get(tripId);
      if (vehicle && Array.isArray(points) && points.length > 0) {
        const lastPt = points[points.length - 1];
        vehicle.currentLat = lastPt.lat;
        vehicle.currentLng = lastPt.lng;
        vehicle.currentSpeed = lastPt.speed || 0;
        vehicle.currentBearing = lastPt.bearing || vehicle.currentBearing;
        vehicle.lastUpdated = new Date().toISOString();
        vehicle.pointsCount += points.length;
        points.forEach((p: any) => vehicle.pointsTrail.push({ lat: p.lat, lng: p.lng }));
        if (vehicle.pointsTrail.length > 100) {
          vehicle.pointsTrail = vehicle.pointsTrail.slice(-100);
        }
        broadcastToAdmins({
          type: 'fleet:point_update',
          tripId,
          lat: lastPt.lat,
          lng: lastPt.lng,
          speed: vehicle.currentSpeed,
          bearing: vehicle.currentBearing,
          lastAddress: vehicle.lastAddress,
          pointsCount: vehicle.pointsCount,
          lastUpdated: vehicle.lastUpdated,
        });
      }
    }
    return res.json({ ok: true, count: points?.length || 0 });
  }

  if (action === 'end') {
    const { tripId, endOdo, distanceKm, fuel, toll, parking, totalExpense, endTs, endLat, endLng, endAddress, endNote, points, receipts } = body;
    const trip = db.trips.find(t => t.tripId === tripId);
    if (trip) {
      trip.status = 'COMPLETED';
      trip.endOdo = endOdo;
      if (distanceKm !== undefined) trip.matchedDistanceKm = distanceKm;
      if (fuel !== undefined) trip.fuel = fuel;
      if (toll !== undefined) trip.toll = toll;
      if (parking !== undefined) trip.parking = parking;
      if (totalExpense !== undefined) trip.totalExpense = totalExpense;
      trip.endTs = endTs || new Date().toISOString();
      trip.endLat = endLat;
      trip.endLng = endLng;
      trip.endAddress = endAddress;
      trip.endNote = endNote;
      if (points) trip.points = points;
      if (receipts) trip.receipts = receipts;
      trip.lastUpdated = new Date().toISOString();
      saveData(db);

      // Remove from live fleet
      if (tripId && activeLiveFleet.has(tripId)) {
        activeLiveFleet.delete(tripId);
        broadcastToAdmins({ type: 'fleet:trip_ended', tripId, endedAt: trip.endTs });
        broadcastPresence();
      }
    }
    return res.json({ ok: true, message: 'Trip completed and synced to Cloud' });
  }

  res.json({ ok: true, message: 'Cloud API acknowledged action: ' + action });
});

// Real-time Fleet REST API endpoints (supports both WebSocket & HTTP polling/fallback)
app.get("/api/live/fleet", (req, res) => {
  res.json({
    ok: true,
    activeTrips: Array.from(activeLiveFleet.values()),
    connectedAdmins: adminSockets.size,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/live/start", (req, res) => {
  const { tripId, driver, vehicle, licensePlate, purpose, startOdo, startTs, startLat, startLng, startAddress } = req.body;
  const liveVehicle: LiveVehicleState = {
    tripId: tripId || `TRIP-${Date.now()}`,
    driver: driver || 'นายมูฮัมหมัด เจะมะ',
    vehicle: vehicle || 'รถยนต์ราชการ',
    licensePlate: licensePlate || 'กข-0000',
    purpose: purpose || 'ไปราชการ',
    startOdo: startOdo || 0,
    startTs: startTs || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    isPaused: false,
    currentLat: startLat || 6.8687,
    currentLng: startLng || 101.3688,
    currentSpeed: 0,
    currentBearing: 0,
    lastAddress: startAddress || 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง',
    pointsCount: 1,
    pointsTrail: [{ lat: startLat || 6.8687, lng: startLng || 101.3688 }],
  };
  activeLiveFleet.set(liveVehicle.tripId, liveVehicle);
  broadcastToAdmins({
    type: 'fleet:trip_started',
    trip: liveVehicle,
  });
  broadcastPresence();
  res.json({ ok: true, trip: liveVehicle });
});

app.post("/api/live/point", (req, res) => {
  const { tripId, lat, lng, speed, bearing, address } = req.body;
  const vehicle = activeLiveFleet.get(tripId);
  if (vehicle) {
    vehicle.currentLat = lat;
    vehicle.currentLng = lng;
    vehicle.currentSpeed = speed || 0;
    vehicle.currentBearing = bearing || vehicle.currentBearing;
    if (address) vehicle.lastAddress = address;
    vehicle.lastUpdated = new Date().toISOString();
    vehicle.pointsCount += 1;
    vehicle.pointsTrail.push({ lat, lng });
    if (vehicle.pointsTrail.length > 100) {
      vehicle.pointsTrail = vehicle.pointsTrail.slice(-100);
    }
    broadcastToAdmins({
      type: 'fleet:point_update',
      tripId,
      lat,
      lng,
      speed: vehicle.currentSpeed,
      bearing: vehicle.currentBearing,
      lastAddress: vehicle.lastAddress,
      pointsCount: vehicle.pointsCount,
      lastUpdated: vehicle.lastUpdated,
    });
  }
  res.json({ ok: true });
});

app.post("/api/live/end", (req, res) => {
  const { tripId } = req.body;
  if (tripId && activeLiveFleet.has(tripId)) {
    activeLiveFleet.delete(tripId);
    broadcastToAdmins({
      type: 'fleet:trip_ended',
      tripId,
      endedAt: new Date().toISOString(),
    });
    broadcastPresence();
  }
  res.json({ ok: true });
});

async function startServer() {
  // Initialize WebSocket Server on the same HTTP server port
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    allSockets.add(ws);

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        // Admin connect message: register as admin receiver
        if (data.type === 'admin:connect') {
          adminSockets.add(ws);
          ws.send(JSON.stringify({
            type: 'init:fleet',
            activeTrips: Array.from(activeLiveFleet.values()),
            connectedAdmins: adminSockets.size,
            activeVehiclesCount: activeLiveFleet.size,
            serverTime: new Date().toISOString(),
          }));
          broadcastPresence();
          return;
        }

        // Admin disconnect message
        if (data.type === 'admin:disconnect') {
          adminSockets.delete(ws);
          broadcastPresence();
          return;
        }

        // Driver starts trip live
        if (data.type === 'trip:start') {
          const t = data.trip;
          if (t && t.tripId) {
            const liveVehicle: LiveVehicleState = {
              tripId: t.tripId,
              driver: t.driver || 'ผู้ขับขี่',
              vehicle: t.vehicle || 'รถยนต์ราชการ',
              licensePlate: t.licensePlate || '',
              purpose: t.purpose || 'ไปราชการ',
              startOdo: t.startOdo || 0,
              startTs: t.startTs || new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              isPaused: false,
              currentLat: t.startLat || 6.8687,
              currentLng: t.startLng || 101.3688,
              currentSpeed: 0,
              currentBearing: 0,
              lastAddress: t.startAddress || 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง',
              pointsCount: 1,
              pointsTrail: [{ lat: t.startLat || 6.8687, lng: t.startLng || 101.3688 }],
            };
            activeLiveFleet.set(t.tripId, liveVehicle);
            broadcastToAdmins({
              type: 'fleet:trip_started',
              trip: liveVehicle,
            });
            broadcastPresence();
          }
          return;
        }

        // Driver streams GPS point live
        if (data.type === 'trip:point') {
          const { tripId, point, address } = data;
          const vehicle = activeLiveFleet.get(tripId);
          if (vehicle && point) {
            vehicle.currentLat = point.lat;
            vehicle.currentLng = point.lng;
            vehicle.currentSpeed = point.speed || 0;
            vehicle.currentBearing = point.bearing || vehicle.currentBearing;
            if (address) vehicle.lastAddress = address;
            vehicle.lastUpdated = new Date().toISOString();
            vehicle.pointsCount += 1;
            vehicle.pointsTrail.push({ lat: point.lat, lng: point.lng });
            if (vehicle.pointsTrail.length > 100) {
              vehicle.pointsTrail = vehicle.pointsTrail.slice(-100);
            }
            broadcastToAdmins({
              type: 'fleet:point_update',
              tripId,
              lat: point.lat,
              lng: point.lng,
              speed: vehicle.currentSpeed,
              bearing: vehicle.currentBearing,
              lastAddress: vehicle.lastAddress,
              pointsCount: vehicle.pointsCount,
              lastUpdated: vehicle.lastUpdated,
            });
          }
          return;
        }

        // Driver pauses or resumes
        if (data.type === 'trip:pause') {
          const { tripId, isPaused } = data;
          const vehicle = activeLiveFleet.get(tripId);
          if (vehicle) {
            vehicle.isPaused = Boolean(isPaused);
            vehicle.lastUpdated = new Date().toISOString();
            broadcastToAdmins({
              type: 'fleet:trip_paused',
              tripId,
              isPaused: vehicle.isPaused,
            });
          }
          return;
        }

        // Driver ends trip
        if (data.type === 'trip:end') {
          const { tripId } = data;
          if (tripId && activeLiveFleet.has(tripId)) {
            activeLiveFleet.delete(tripId);
            broadcastToAdmins({
              type: 'fleet:trip_ended',
              tripId,
              endedAt: new Date().toISOString(),
            });
            broadcastPresence();
          }
          return;
        }

        // Heartbeat
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
      } catch (e) {
        console.warn('Invalid WebSocket message received:', e);
      }
    });

    ws.on('close', () => {
      allSockets.delete(ws);
      if (adminSockets.has(ws)) {
        adminSockets.delete(ws);
        broadcastPresence();
      }
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Car Trip Tracker Server + WebSockets running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
