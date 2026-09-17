import React, { useState, useEffect, useRef } from 'react';
import { ActiveTripState, GpsPoint, Waypoint } from '../types';
import { TripMap } from './TripMap';
import { calculateTrackDistanceKm, simulateNextPosition, formatThaiDateTime, reverseGeocode } from '../services/geoService';
import { Square, Activity, Gauge, MapPin, Clock, User, Compass, Zap, Pause, Play, Plus, Flag, Car, Check } from 'lucide-react';

interface ActiveTripTrackerProps {
  activeTrip: ActiveTripState;
  points: GpsPoint[];
  onAddPoint: (point: GpsPoint) => void;
  onOpenEndModal: () => void;
  onAddWaypoint?: (waypoint: Waypoint) => void;
  onTogglePause?: (isPaused: boolean) => void;
  isSyncing: boolean;
}

export const ActiveTripTracker: React.FC<ActiveTripTrackerProps> = ({
  activeTrip,
  points,
  onAddPoint,
  onOpenEndModal,
  onAddWaypoint,
  onTogglePause,
  isSyncing,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState<boolean>(Boolean(activeTrip.isPaused));
  
  // Waypoint modal state
  const [showWaypointModal, setShowWaypointModal] = useState(false);
  const [waypointName, setWaypointName] = useState('');
  const [waypointNote, setWaypointNote] = useState('');
  const [isSavingWaypoint, setIsSavingWaypoint] = useState(false);

  const simIntervalRef = useRef<any>(null);
  const lastHeadingRef = useRef<number>(45);
  const pointsRef = useRef<GpsPoint[]>(points);
  const onAddPointRef = useRef(onAddPoint);
  const isPausedRef = useRef(isPaused);

  // Keep refs synchronized
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    onAddPointRef.current = onAddPoint;
  }, [onAddPoint]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Timer calculation from activeTrip.startTs accounting for pause
  useEffect(() => {
    const startMs = new Date(activeTrip.startTs).getTime();
    
    const interval = setInterval(() => {
      if (!isPausedRef.current) {
        const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        setElapsedSeconds(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrip.startTs]);

  // Real GPS Tracking with navigator.geolocation.watchPosition (Stable registration)
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPausedRef.current) {
          setCurrentSpeed(0);
          return;
        }

        const { latitude, longitude, speed, heading, accuracy, altitude } = pos.coords;
        const spKmh = speed ? Math.round(speed * 3.6) : 0;
        setCurrentSpeed(spKmh);

        const currentPts = pointsRef.current;
        const newPoint: GpsPoint = {
          seq: currentPts.length + 1,
          lat: latitude,
          lng: longitude,
          speed: spKmh,
          bearing: heading || lastHeadingRef.current,
          accuracy: accuracy || null,
          altitude: altitude || null,
          ts: new Date().toISOString(),
          syncStatus: 0,
        };

        if (heading) lastHeadingRef.current = heading;
        onAddPointRef.current(newPoint);
      },
      (err) => {
        console.warn('Geolocation watch notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Simulated Driving Loop (for testing inside browser/iframe)
  useEffect(() => {
    if (isSimulating && !isPaused) {
      simIntervalRef.current = setInterval(() => {
        const currentPts = pointsRef.current;
        const lastPt = currentPts.length > 0 ? currentPts[currentPts.length - 1] : {
          lat: activeTrip.startLat || 13.7563,
          lng: activeTrip.startLng || 100.5018,
        };

        const simSpeed = 40 + Math.round(Math.random() * 25);
        setCurrentSpeed(simSpeed);

        const next = simulateNextPosition(
          lastPt.lat,
          lastPt.lng,
          lastHeadingRef.current,
          simSpeed,
          3
        );

        lastHeadingRef.current = next.bearing;

        const simulatedPoint: GpsPoint = {
          seq: currentPts.length + 1,
          lat: next.lat,
          lng: next.lng,
          speed: next.speed,
          bearing: next.bearing,
          accuracy: 8,
          altitude: 15,
          ts: new Date().toISOString(),
          syncStatus: 0,
        };

        onAddPointRef.current(simulatedPoint);
      }, 3000);
    } else {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
    }

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulating, isPaused, activeTrip.startLat, activeTrip.startLng]);

  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (nextPaused) {
      setCurrentSpeed(0);
    }
    if (onTogglePause) {
      onTogglePause(nextPaused);
    }
  };

  const handleSaveWaypoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waypointName.trim()) return;

    setIsSavingWaypoint(true);
    const lastPt = points.length > 0 ? points[points.length - 1] : {
      lat: activeTrip.startLat || 13.7563,
      lng: activeTrip.startLng || 100.5018,
    };

    let address = '';
    try {
      address = await reverseGeocode(lastPt.lat, lastPt.lng);
    } catch {
      address = `${lastPt.lat.toFixed(5)}, ${lastPt.lng.toFixed(5)}`;
    }

    const newWaypoint: Waypoint = {
      id: `wp_${Date.now()}`,
      name: waypointName.trim(),
      note: waypointNote.trim() || undefined,
      address,
      lat: lastPt.lat,
      lng: lastPt.lng,
      ts: new Date().toISOString(),
    };

    if (onAddWaypoint) {
      onAddWaypoint(newWaypoint);
    }

    setIsSavingWaypoint(false);
    setShowWaypointModal(false);
    setWaypointName('');
    setWaypointNote('');
  };

  const liveDistanceKm = calculateTrackDistanceKm(points);

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentLoc = points.length > 0 ? { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng } : (
    activeTrip.startLat && activeTrip.startLng ? { lat: activeTrip.startLat, lng: activeTrip.startLng } : null
  );

  const waypoints = activeTrip.waypoints || [];

  return (
    <div id="active-trip-tracker" className="space-y-4">
      {/* Top Banner Status */}
      <div className={`text-white px-4 py-3 rounded-2xl shadow-md flex items-center justify-between transition-colors ${
        isPaused ? 'bg-amber-600' : 'bg-emerald-600'
      }`}>
        <div className="flex items-center space-x-2.5">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isPaused ? 'bg-amber-300' : 'bg-emerald-300'
            }`}></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
          <div>
            <h3 className="text-sm font-bold tracking-tight">
              {isPaused ? 'พักการเดินทางชั่วคราว (Paused)' : 'กำลังบันทึกการเดินทาง (In Progress)'}
            </h3>
            <p className="text-[11px] text-white/80">
              เริ่มเมื่อ: {formatThaiDateTime(activeTrip.startTs)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Pause / Resume Button */}
          <button
            type="button"
            id="btn-pause-resume-trip"
            onClick={handleTogglePause}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-all flex items-center space-x-1 cursor-pointer"
            title={isPaused ? 'เริ่มเดินทางต่อ' : 'พักการเดินทางชั่วคราว'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            <span>{isPaused ? 'เดินทางต่อ' : 'พักชั่วคราว'}</span>
          </button>

          {/* Simulation Button */}
          <button
            id="btn-toggle-simulation"
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1 cursor-pointer ${
              isSimulating
                ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-sm animate-pulse'
                : 'bg-black/20 text-white border-white/20 hover:bg-black/30'
            }`}
            title="จำลองพิกัดการขับรถเพื่อทดสอบระบบ"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isSimulating ? 'กำลังจำลอง...' : 'จำลองขับรถ'}</span>
          </button>
        </div>
      </div>

      {/* Main HUD Gauge Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        {/* Big Dashboard Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center justify-center space-x-1 mb-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>เวลาที่ใช้</span>
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {formatTimer(elapsedSeconds)}
            </span>
          </div>

          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="text-[11px] font-semibold text-blue-700 flex items-center justify-center space-x-1 mb-1">
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>ระยะทาง (GPS)</span>
            </span>
            <span className="text-xl sm:text-2xl font-black text-blue-700">
              {liveDistanceKm.toFixed(2)}
              <span className="text-xs font-semibold ml-1">กม.</span>
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center justify-center space-x-1 mb-1">
              <Gauge className="w-3.5 h-3.5 text-emerald-600" />
              <span>ความเร็วปัจจุบัน</span>
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {isPaused ? 0 : currentSpeed}
              <span className="text-xs font-semibold ml-1">กม./ชม.</span>
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center justify-center space-x-1 mb-1">
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span>พิกัด GPS</span>
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {points.length}
              <span className="text-xs font-normal text-slate-400 ml-1">จุด</span>
            </span>
          </div>
        </div>

        {/* Trip Meta details & Vehicle Info */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 space-y-1.5 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>ผู้ขับขี่:</span>
            </span>
            <span className="font-bold text-slate-900">{activeTrip.driver}</span>
          </div>

          {activeTrip.licensePlate && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center space-x-1">
                <Car className="w-3.5 h-3.5 text-blue-600" />
                <span>ยานพาหนะ:</span>
              </span>
              <span className="font-bold text-blue-700">
                {activeTrip.licensePlate} {activeTrip.vehicle ? `(${activeTrip.vehicle})` : ''}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-slate-500">วัตถุประสงค์:</span>
            <span className="font-semibold text-slate-800 truncate max-w-[240px]">
              {activeTrip.purpose}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">เลขไมล์เริ่มต้น:</span>
            <span className="font-mono font-semibold text-slate-900">
              {activeTrip.startOdo.toLocaleString()} กม.
            </span>
          </div>

          {activeTrip.startAddress && (
            <div className="flex items-start justify-between">
              <span className="text-slate-500 shrink-0 mr-2 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>จุดเริ่มต้น:</span>
              </span>
              <span className="text-right text-slate-700 truncate">{activeTrip.startAddress}</span>
            </div>
          )}
        </div>

        {/* Waypoints Section */}
        <div className="mb-4 p-3 bg-blue-50/40 rounded-xl border border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <Flag className="w-3.5 h-3.5 text-blue-600" />
              <span>จุดแวะพักระหว่างทาง ({waypoints.length})</span>
            </span>
            <button
              type="button"
              id="btn-add-waypoint"
              onClick={() => setShowWaypointModal(true)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>บันทึกจุดแวะพัก</span>
            </button>
          </div>

          {waypoints.length > 0 ? (
            <div className="space-y-1.5">
              {waypoints.map((wp, idx) => (
                <div key={wp.id} className="p-2 bg-white rounded-lg border border-slate-200/80 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-slate-800">{wp.name}</p>
                      {wp.address && <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{wp.address}</p>}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(wp.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              ยังไม่มีจุดแวะพัก กด "บันทึกจุดแวะพัก" เมื่อแวะส่งของ ส่งเอกสาร หรือเติมน้ำมัน
            </p>
          )}
        </div>

        {/* Live Route Map */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
            <span>แผนที่เส้นทางแบบเรียลไทม์</span>
            <span className="text-[11px] text-slate-400 font-normal">
              อัปเดตเส้นทางอัตโนมัติตามสัญญาณ GPS
            </span>
          </div>
          <TripMap
            points={points}
            currentLocation={currentLoc}
            startPoint={
              activeTrip.startLat && activeTrip.startLng
                ? { lat: activeTrip.startLat, lng: activeTrip.startLng }
                : null
            }
            height="260px"
          />
        </div>

        {/* Action Button: End Trip */}
        <button
          id="btn-open-end-modal"
          onClick={onOpenEndModal}
          className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl text-sm shadow-md shadow-rose-600/25 transition-all flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Square className="w-4 h-4 fill-current" />
          <span>สิ้นสุดการเดินทาง (End Trip)</span>
        </button>
      </div>

      {/* Add Waypoint Modal */}
      {showWaypointModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center space-x-2">
              <Flag className="w-4 h-4 text-blue-600" />
              <span>บันทึกจุดแวะพัก / ส่งของ</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">ระบบจะบันทึกพิกัด GPS ปัจจุบันและเวลาโดยอัตโนมัติ</p>

            <form onSubmit={handleSaveWaypoint} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">ชื่อจุดแวะพักหรือสถานที่ *</label>
                <input
                  type="text"
                  value={waypointName}
                  onChange={(e) => setWaypointName(e.target.value)}
                  placeholder="เช่น ปั๊ม ปตท. วิภาวดี, ส่งสินค้าจุดที่ 1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
                <input
                  type="text"
                  value={waypointNote}
                  onChange={(e) => setWaypointNote(e.target.value)}
                  placeholder="เช่น เซ็นรับสินค้าเรียบร้อย"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWaypointModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingWaypoint || !waypointName.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {isSavingWaypoint ? 'กำลังบันทึก...' : 'บันทึกจุดแวะ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
