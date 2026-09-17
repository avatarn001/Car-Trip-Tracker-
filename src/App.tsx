import React, { useState, useEffect, useCallback } from 'react';
import { Trip, ActiveTripState, GpsPoint, GasConfig, SyncQueueItem, ReceiptItem, Vehicle, Waypoint, UserProfile } from './types';
import { storage } from './services/storage';
import { gasService } from './services/gasService';
import { calculateTrackDistanceKm, reverseGeocode, fetchOsrmRoadDistance } from './services/geoService';
import { Navbar } from './components/Navbar';
import { StartTripCard } from './components/StartTripCard';
import { ActiveTripTracker } from './components/ActiveTripTracker';
import { EndTripModal } from './components/EndTripModal';
import { TripHistoryView } from './components/TripHistoryView';
import { SummaryDashboard } from './components/SummaryDashboard';
import { GasSettingsModal } from './components/GasSettingsModal';
import { GoogleLoginModal } from './components/GoogleLoginModal';
import { Car, BarChart3, Clock, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'trip' | 'summary' | 'history'>('trip');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Authentication state (Google Login)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('CTT_CURRENT_USER');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('CTT_CURRENT_USER', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('CTT_CURRENT_USER');
    }
  }, [currentUser]);

  // Core trip states
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTrip, setActiveTrip] = useState<ActiveTripState | null>(null);
  const [points, setPoints] = useState<GpsPoint[]>([]);

  // Modals & UI states
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [gasConfig, setGasConfig] = useState<GasConfig>(storage.getGasConfig());
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'warn' | 'err' } | null>(null);

  const showToast = useCallback((message: string, type: 'ok' | 'warn' | 'err' = 'ok') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const handleOpenSettings = () => {
    if (currentUser?.email === 'junko223@gmail.com') {
      setIsSettingsOpen(true);
    } else {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าถึงเมนูตั้งค่าได้', 'err');
    }
  };

  // Initialize data on mount
  useEffect(() => {
    async function initCloudSync() {
      await storage.syncWithServer();
      setTrips(storage.getTrips());
      setVehicles(storage.getVehicles());
      setActiveTrip(storage.getActiveTrip());
      setPoints(storage.getTrackPoints());
      setGasConfig(storage.getGasConfig());
      setQueue(storage.getSyncQueue());
    }
    initCloudSync();

    const handleOnline = () => {
      setIsOnline(true);
      showToast('กลับสู่ออนไลน์แล้ว กำลังตรวจสอบการซิงก์ข้อมูล...', 'ok');
      storage.syncWithServer().then(() => {
        setTrips(storage.getTrips());
        setVehicles(storage.getVehicles());
      });
      flushQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('ขณะนี้อยู่ในโหมดออฟไลน์ ข้อมูลจะถูกเก็บในเครื่อง', 'warn');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Periodic flush of sync queue
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || !gasConfig.enabled || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await gasService.flushQueue();
      if (res.processed > 0) {
        showToast(`ซิงก์ข้อมูลขึ้นชีตสำเร็จ ${res.processed} รายการ`, 'ok');
      }
      setQueue(storage.getSyncQueue());
    } catch {
      // silent
    } finally {
      setIsSyncing(false);
    }
  }, [gasConfig.enabled, isSyncing, showToast]);

  useEffect(() => {
    const interval = setInterval(() => {
      flushQueue();
    }, 45000);
    return () => clearInterval(interval);
  }, [flushQueue]);

  // Start new trip handler
  const handleStartTrip = async (data: {
    driver: string;
    vehicle?: string;
    licensePlate?: string;
    purpose: string;
    startOdo: number;
    startLat: number | null;
    startLng: number | null;
    startAddress?: string;
    startNote?: string;
  }) => {
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const newActiveState: ActiveTripState = {
      tripId: null,
      startRequestId: requestId,
      driver: data.driver,
      vehicle: data.vehicle,
      licensePlate: data.licensePlate,
      purpose: data.purpose,
      startOdo: data.startOdo,
      startTs: now,
      startLat: data.startLat,
      startLng: data.startLng,
      startAddress: data.startAddress,
      startNote: data.startNote,
      waypoints: [],
      isPaused: false,
      seq: 0,
      sentSeq: 0,
      pendingBatchId: null,
      state: 'ACTIVE',
    };

    // Initial GPS Point
    const initialPoints: GpsPoint[] = [];
    if (data.startLat && data.startLng) {
      initialPoints.push({
        seq: 1,
        lat: data.startLat,
        lng: data.startLng,
        accuracy: 10,
        speed: 0,
        bearing: 0,
        ts: now,
        syncStatus: 0,
      });
    }

    storage.saveActiveTrip(newActiveState);
    storage.saveTrackPoints(initialPoints);
    setActiveTrip(newActiveState);
    setPoints(initialPoints);

    showToast('เริ่มการเดินทางเรียบร้อยแล้ว!', 'ok');

    // Attempt backend start
    if (gasConfig.enabled) {
      setIsSyncing(true);
      const res = await gasService.startTrip({
        requestId,
        driver: data.driver,
        vehicle: data.vehicle,
        licensePlate: data.licensePlate,
        purpose: data.purpose,
        startOdo: data.startOdo,
        startTs: now,
        startLat: data.startLat,
        startLng: data.startLng,
        startAddress: data.startAddress,
        startNote: data.startNote,
      });

      if (res.ok && res.tripId) {
        newActiveState.tripId = res.tripId;
        storage.saveActiveTrip(newActiveState);
        setActiveTrip({ ...newActiveState });
      }
      setIsSyncing(false);
      setQueue(storage.getSyncQueue());
    }
  };

  // Add GPS point during active trip
  const handleAddPoint = useCallback((newPt: GpsPoint) => {
    setPoints((prev) => {
      // Deduplicate points too close in time or exact seq
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last.seq === newPt.seq) return prev;
      }
      const next = [...prev, newPt];
      storage.saveTrackPoints(next);
      return next;
    });
  }, []);

  // Add waypoint to active trip
  const handleAddWaypoint = (wp: Waypoint) => {
    if (!activeTrip) return;
    const currentWps = activeTrip.waypoints || [];
    const updated = [...currentWps, wp];
    const nextState = { ...activeTrip, waypoints: updated };
    setActiveTrip(nextState);
    storage.saveActiveTrip(nextState);
    showToast(`บันทึกจุดแวะพัก: ${wp.name}`, 'ok');
  };

  // Toggle pause
  const handleTogglePause = (isPaused: boolean) => {
    if (!activeTrip) return;
    const nextState = { ...activeTrip, isPaused, pausedAt: isPaused ? new Date().toISOString() : null };
    setActiveTrip(nextState);
    storage.saveActiveTrip(nextState);
    showToast(isPaused ? 'พักการเดินทางชั่วคราว' : 'เดินทางต่อแล้ว', isPaused ? 'warn' : 'ok');
  };

  // End trip submission
  const handleSubmitEnd = async (data: {
    endOdo: number;
    endLat: number | null;
    endLng: number | null;
    endAddress?: string;
    endNote?: string;
    fuel: number;
    toll: number;
    parking: number;
    receipts: ReceiptItem[];
  }) => {
    if (!activeTrip) return;

    const endTs = new Date().toISOString();
    const startMs = new Date(activeTrip.startTs).getTime();
    const endMs = new Date(endTs).getTime();
    const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));

    const gpsKm = calculateTrackDistanceKm(points);
    const odoKm = Math.max(0, data.endOdo - activeTrip.startOdo);

    let matchedKm = gpsKm > 0 ? gpsKm : odoKm;
    let distanceSource: 'OSRM' | 'GPS' | 'ODO' = points.length > 3 ? 'GPS' : 'ODO';

    // Attempt OSRM road distance check if start and end coordinates exist
    if (activeTrip.startLat && activeTrip.startLng && data.endLat && data.endLng) {
      try {
        const osrm = await fetchOsrmRoadDistance(
          activeTrip.startLat,
          activeTrip.startLng,
          data.endLat,
          data.endLng
        );
        if (osrm && osrm.distanceKm > 0) {
          // If GPS distance is within reasonable range or OSRM is closer to odometer, match to OSRM
          matchedKm = osrm.distanceKm;
          distanceSource = 'OSRM';
        }
      } catch (e) {
        console.warn('OSRM matching fallback:', e);
      }
    }

    const totalExpense = data.fuel + data.toll + data.parking;

    const completedTrip: Trip = {
      tripId: activeTrip.tripId || `TRIP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36)}`,
      status: 'COMPLETED',
      generation: 1,
      startRequestId: activeTrip.startRequestId,
      driver: activeTrip.driver,
      vehicle: activeTrip.vehicle,
      licensePlate: activeTrip.licensePlate,
      purpose: activeTrip.purpose,
      startOdo: activeTrip.startOdo,
      endOdo: data.endOdo,
      odoDistanceKm: odoKm,
      gpsDistanceKm: Math.round(gpsKm * 10) / 10,
      matchedDistanceKm: Math.round(matchedKm * 10) / 10,
      distanceSource,
      startTs: activeTrip.startTs,
      endTs,
      durationMin,
      startLat: activeTrip.startLat,
      startLng: activeTrip.startLng,
      startAddress: activeTrip.startAddress,
      endLat: data.endLat,
      endLng: data.endLng,
      endAddress: data.endAddress,
      waypoints: activeTrip.waypoints || [],
      pointCount: points.length,
      fuel: data.fuel,
      toll: data.toll,
      parking: data.parking,
      totalExpense,
      receiptCount: data.receipts.length,
      receipts: data.receipts,
      receiptUrls: data.receipts.map((r) => r.data),
      startNote: activeTrip.startNote,
      endNote: data.endNote,
      note: data.endNote,
      createdAt: activeTrip.startTs,
      lastUpdated: endTs,
      points: [...points],
    };

    // Update vehicle's current odometer in storage
    if (activeTrip.licensePlate && data.endOdo > 0) {
      storage.updateVehicleOdometer(activeTrip.licensePlate, data.endOdo);
      setVehicles(storage.getVehicles());
    }

    // Save locally immediately
    storage.addTrip(completedTrip);
    storage.saveActiveTrip(null);
    storage.clearTrackPoints();

    setTrips(storage.getTrips());
    setActiveTrip(null);
    setPoints([]);
    setIsEndModalOpen(false);

    showToast(`ปิดทริปสำเร็จ! ระยะทาง ${matchedKm.toFixed(1)} กม.`, 'ok');

    // Attempt backend end
    if (gasConfig.enabled) {
      setIsSyncing(true);
      await gasService.endTrip({
        requestId: `END-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tripId: completedTrip.tripId,
        startRequestId: activeTrip.startRequestId,
        endOdo: data.endOdo,
        endTs,
        endLat: data.endLat,
        endLng: data.endLng,
        endAddress: data.endAddress,
        endNote: data.endNote,
        fuel: data.fuel,
        toll: data.toll,
        parking: data.parking,
        receipts: data.receipts,
        points,
      });
      setIsSyncing(false);
      setQueue(storage.getSyncQueue());
    }

    // Switch to history tab to view the recorded trip
    setActiveTab('history');
  };

  const handleDeleteTrip = (tripId: string) => {
    storage.deleteTrip(tripId);
    setTrips(storage.getTrips());
    showToast('ลบรายการทริปเรียบร้อยแล้ว', 'ok');
  };

  const handleUpdateTrip = (updated: Trip) => {
    storage.updateTrip(updated);
    setTrips(storage.getTrips());
    showToast('แก้ไขข้อมูลการเดินทางเรียบร้อยแล้ว', 'ok');
  };

  const handleAddManualTrip = (newTrip: Trip) => {
    storage.addTrip(newTrip);
    setTrips(storage.getTrips());
    setVehicles(storage.getVehicles());
    showToast('บันทึกประวัติการเดินทางย้อนหลังเรียบร้อย', 'ok');
  };

  const handleClearDemoData = () => {
    storage.clearDemoTrips();
    setTrips(storage.getTrips());
    showToast('ล้างข้อมูลตัวอย่างแล้ว พร้อมใช้งานจริง!', 'ok');
  };

  const handleLoadSampleData = () => {
    storage.loadSampleData();
    setTrips(storage.getTrips());
    setVehicles(storage.getVehicles());
    showToast('โหลดข้อมูลตัวอย่างสำหรับทดสอบแล้ว', 'ok');
  };

  const handleRefreshSummary = async () => {
    if (gasConfig.enabled && isOnline) {
      setIsSyncing(true);
      const res = await gasService.syncInitialData();
      setIsSyncing(false);
      if (res.ok) {
        setTrips(storage.getTrips());
        showToast('อัปเดตข้อมูลล่าสุดจากชีตเรียบร้อย', 'ok');
        return;
      }
    }
    setTrips(storage.getTrips());
    showToast('รีเฟรชข้อมูลเรียบร้อย', 'ok');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-10 font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isOnline={isOnline}
        queueCount={queue.length}
        gasConfig={gasConfig}
        onOpenSettings={handleOpenSettings}
        onForceSync={flushQueue}
        isSyncing={isSyncing}
        currentUser={currentUser}
        onLogout={() => {
          setCurrentUser(null);
          showToast('ออกจากระบบเรียบร้อย', 'ok');
        }}
      />

      {/* Google Login Modal (Required for users) */}
      <GoogleLoginModal
        isOpen={!currentUser}
        onLogin={(user) => {
          setCurrentUser(user);
          showToast(`เข้าสู่ระบบสำเร็จ (${user.email})`, 'ok');
        }}
      />

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-5">
        {/* TAB 1: TRIP (Start or Active HUD) */}
        {activeTab === 'trip' && (
          <div>
            {activeTrip ? (
              <ActiveTripTracker
                activeTrip={activeTrip}
                points={points}
                onAddPoint={handleAddPoint}
                onOpenEndModal={() => setIsEndModalOpen(true)}
                onAddWaypoint={handleAddWaypoint}
                onTogglePause={handleTogglePause}
                isSyncing={isSyncing}
              />
            ) : (
              <div className="max-w-xl mx-auto">
                <StartTripCard onStartTrip={handleStartTrip} isLoading={isSyncing} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SUMMARY / DASHBOARD */}
        {activeTab === 'summary' && (
          <SummaryDashboard
            trips={trips}
            onRefresh={handleRefreshSummary}
            isSyncing={isSyncing}
          />
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'history' && (
          <TripHistoryView
            trips={trips}
            onDeleteTrip={handleDeleteTrip}
            onUpdateTrip={handleUpdateTrip}
            onAddTrip={handleAddManualTrip}
            onClearDemoData={handleClearDemoData}
            onLoadSampleData={handleLoadSampleData}
            vehicles={vehicles}
          />
        )}
      </main>

      {/* End Trip Modal */}
      {activeTrip && (
        <EndTripModal
          isOpen={isEndModalOpen}
          onClose={() => setIsEndModalOpen(false)}
          activeTrip={activeTrip}
          points={points}
          onSubmitEnd={handleSubmitEnd}
          isSubmitting={isSyncing}
        />
      )}

      {/* Google Apps Script Settings Modal */}
      <GasSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={gasConfig}
        onSaveConfig={(updated) => {
          storage.saveGasConfig(updated);
          setGasConfig(updated);
          showToast('บันทึกการตั้งค่าแล้ว', 'ok');
        }}
        queue={queue}
        onFlushQueue={flushQueue}
      />

      {/* Toast Notification Alert */}
      {toast && (
        <div
          id="global-toast-alert"
          className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[10001] px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white flex items-center space-x-2 transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toast.type === 'ok'
              ? 'bg-emerald-600'
              : toast.type === 'warn'
              ? 'bg-amber-600'
              : 'bg-rose-600'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : toast.type === 'warn' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex md:hidden">
        <button
          onClick={() => setActiveTab('trip')}
          className={`flex-1 py-3 text-center flex flex-col items-center justify-center transition-colors ${
            activeTab === 'trip' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Car className="w-5 h-5 mb-1" />
          <span className="text-[11px]">บันทึกทริป</span>
        </button>

        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 py-3 text-center flex flex-col items-center justify-center transition-colors ${
            activeTab === 'summary' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <BarChart3 className="w-5 h-5 mb-1" />
          <span className="text-[11px]">สรุปสถิติ</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-center flex flex-col items-center justify-center transition-colors ${
            activeTab === 'history' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Clock className="w-5 h-5 mb-1" />
          <span className="text-[11px]">ประวัติ</span>
        </button>
      </nav>
    </div>
  );
}
