import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

function loadData(): AppData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return {
        trips: data.trips || DEFAULT_TRIPS,
        vehicles: data.vehicles || DEFAULT_VEHICLES,
        drivers: data.drivers || DEFAULT_DRIVERS,
        gasConfig: data.gasConfig || { scriptUrl: '', apiKey: '', enabled: true, autoSync: true, isConnected: true, version: 'V5.3.9-Cloud' },
        syncQueue: data.syncQueue || [],
      };
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
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error writing data.json:', e);
  }
}

let db = loadData();

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
    }
    return res.json({ ok: true, message: 'Trip completed and synced to Cloud' });
  }

  res.json({ ok: true, message: 'Cloud API acknowledged action: ' + action });
});

async function startServer() {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Car Trip Tracker Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
