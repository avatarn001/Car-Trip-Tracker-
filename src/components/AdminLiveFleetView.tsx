import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { 
  Wifi, WifiOff, Radio, Car, Navigation, Gauge, Clock, User, 
  MapPin, Play, Square, Activity, RefreshCw, ShieldCheck, 
  ChevronRight, AlertCircle, Eye, Zap, Layers, Terminal
} from 'lucide-react';
import { LiveFleetVehicle } from '../types';
import { realtimeService, RealtimeConnectionStatus, RealtimePresence, RealtimeLogEntry } from '../services/realtimeService';

interface AdminLiveFleetViewProps {
  onClose?: () => void;
}

export const AdminLiveFleetView: React.FC<AdminLiveFleetViewProps> = ({ onClose }) => {
  const [status, setStatus] = useState<RealtimeConnectionStatus>(realtimeService.getStatus());
  const [fleet, setFleet] = useState<LiveFleetVehicle[]>(realtimeService.getFleet());
  const [presence, setPresence] = useState<RealtimePresence>(realtimeService.getPresence());
  const [logs, setLogs] = useState<RealtimeLogEntry[]>(realtimeService.getLogs());
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(realtimeService.isSimulating());
  const [latency, setLatency] = useState<number>(realtimeService.getLatency());

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const vehiclePolylinesRef = useRef<Map<string, L.Polyline>>(new Map());

  // Subscribe to realtimeService events
  useEffect(() => {
    const unsubStatus = realtimeService.onStatusChange((s) => setStatus(s));
    const unsubFleet = realtimeService.onFleetUpdate((list) => {
      setFleet(list);
      if (list.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(list[0].tripId);
      }
    });
    const unsubPresence = realtimeService.onPresenceChange((p) => setPresence(p));
    const unsubLogs = realtimeService.onLog(() => {
      setLogs(realtimeService.getLogs());
    });

    const latencyTimer = setInterval(() => {
      setLatency(realtimeService.getLatency());
      setIsSimulating(realtimeService.isSimulating());
    }, 1500);

    return () => {
      unsubStatus();
      unsubFleet();
      unsubPresence();
      unsubLogs();
      clearInterval(latencyTimer);
    };
  }, [selectedVehicleId]);

  // Handle Admin Connect / Disconnect button click
  const handleToggleConnect = () => {
    if (status === 'connected' || status === 'connecting') {
      realtimeService.disconnectAdmin();
    } else {
      realtimeService.connectAdmin();
    }
  };

  // Toggle Demo Simulation
  const handleToggleSimulation = () => {
    if (isSimulating) {
      realtimeService.stopDemoSimulation();
      setIsSimulating(false);
    } else {
      // Auto-connect admin if not yet connected
      if (status !== 'connected') {
        realtimeService.connectAdmin();
      }
      realtimeService.startDemoSimulation();
      setIsSimulating(true);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      // Default center: Yaring district, Pattani
      const map = L.map(mapContainerRef.current, {
        center: [6.8687, 101.3688],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    }

    return () => {
      // Keep map reference across re-renders
    };
  }, []);

  // Update Map Markers & Polylines when fleet changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = vehicleMarkersRef.current;
    const currentPolylines = vehiclePolylinesRef.current;

    // Track active IDs to remove dead ones
    const activeIds = new Set<string>();

    fleet.forEach((v) => {
      activeIds.add(v.tripId);
      const isSelected = v.tripId === selectedVehicleId;

      // Custom HTML Marker with pulsing ripple and car direction arrow
      const carIconHtml = `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; border-radius: 9999px; background-color: ${
            v.isPaused ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.4)'
          }; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 34px; height: 34px; border-radius: 9999px; background: ${
            isSelected ? '#2563eb' : (v.isPaused ? '#d97706' : '#059669')
          }; border: 3px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; transform: rotate(${v.currentBearing}deg); transition: transform 0.5s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
          <div style="position: absolute; bottom: -18px; white-space: nowrap; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); color: #ffffff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            ${v.currentSpeed} กม./ชม.
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-fleet-marker',
        html: carIconHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      // Update or create marker
      if (currentMarkers.has(v.tripId)) {
        const marker = currentMarkers.get(v.tripId)!;
        marker.setLatLng([v.currentLat, v.currentLng]);
        marker.setIcon(customIcon);
      } else {
        const marker = L.marker([v.currentLat, v.currentLng], { icon: customIcon }).addTo(map);
        marker.on('click', () => {
          setSelectedVehicleId(v.tripId);
        });
        currentMarkers.set(v.tripId, marker);
      }

      // Update or create polyline trail
      const trailCoords = (v.pointsTrail || []).map((p) => [p.lat, p.lng] as [number, number]);
      if (trailCoords.length > 0) {
        if (currentPolylines.has(v.tripId)) {
          const polyline = currentPolylines.get(v.tripId)!;
          polyline.setLatLngs(trailCoords);
        } else {
          const polyline = L.polyline(trailCoords, {
            color: isSelected ? '#2563eb' : '#059669',
            weight: 4,
            opacity: 0.8,
            dashArray: v.isPaused ? '6, 8' : undefined,
          }).addTo(map);
          currentPolylines.set(v.tripId, polyline);
        }
      }
    });

    // Remove markers and polylines for ended trips
    currentMarkers.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        map.removeLayer(marker);
        currentMarkers.delete(id);
      }
    });

    currentPolylines.forEach((polyline, id) => {
      if (!activeIds.has(id)) {
        map.removeLayer(polyline);
        currentPolylines.delete(id);
      }
    });

    // If a vehicle is selected, smoothly pan map to it
    if (selectedVehicleId && currentMarkers.has(selectedVehicleId)) {
      const selected = fleet.find((v) => v.tripId === selectedVehicleId);
      if (selected) {
        map.panTo([selected.currentLat, selected.currentLng], { animate: true, duration: 0.8 });
      }
    } else if (fleet.length > 0 && !selectedVehicleId) {
      const bounds = L.latLngBounds(fleet.map((v) => [v.currentLat, v.currentLng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [fleet, selectedVehicleId]);

  const selectedVehicle = fleet.find((v) => v.tripId === selectedVehicleId);

  return (
    <div className="space-y-4">
      {/* Top Banner & Main Connect Switch */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${
              status === 'connected' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm ring-4 ring-emerald-500/10' 
                : status === 'connecting'
                ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse'
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}>
              {status === 'connected' ? (
                <Radio className="w-6 h-6 text-emerald-600 animate-pulse" />
              ) : status === 'connecting' ? (
                <RefreshCw className="w-6 h-6 text-amber-600 animate-spin" />
              ) : (
                <WifiOff className="w-6 h-6 text-slate-400" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  ระบบติดตามสดเรียลไทม์ (Admin Fleet Monitor)
                </h2>
                {status === 'connected' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 animate-pulse">
                    ● ONLINE LIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {status === 'connected'
                  ? `เชื่อมต่อเรียลไทม์ผ่าน WebSocket สำเร็จ • เซิร์ฟเวอร์ตอบสนอง ${latency > 0 ? latency + 'ms' : 'เร็วมาก'}`
                  : 'กดปุ่มด้านขวาเพื่อเปิดระบบออนไลน์เรียลไทม์และดูตำแหน่งรถสดบนแผนที่'}
              </p>
            </div>
          </div>

          {/* Action Buttons: Connect / Disconnect */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleSimulation}
              className={`px-3 py-2.5 rounded-2xl text-xs font-bold border flex items-center space-x-1.5 transition-all cursor-pointer ${
                isSimulating 
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm' 
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="ทดสอบจำลองรถวิ่งสดบนทางหลวง 42 ยะหริ่ง-ปัตตานี"
            >
              <Car className="w-3.5 h-3.5" />
              <span>{isSimulating ? '🛑 หยุดรถจำลอง' : '🚗 ทดสอบรถจำลอง'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleConnect}
              className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center space-x-2 shadow-sm transition-all cursor-pointer ${
                status === 'connected'
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  : status === 'connecting'
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white ring-4 ring-emerald-500/20'
              }`}
            >
              {status === 'connected' ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>ตัดการเชื่อมต่อ</span>
                </>
              ) : status === 'connecting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังเชื่อมต่อ...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  <span>⚡ เชื่อมต่อระบบเรียลไทม์</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-slate-100">
          <div className="bg-slate-50/90 rounded-2xl p-2.5 border border-slate-200/70">
            <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-semibold">
              <Car className="w-3.5 h-3.5 text-blue-600" />
              <span>รถกำลังเดินทางสด</span>
            </div>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black font-mono text-slate-900">{fleet.length}</span>
              <span className="text-[11px] font-bold text-slate-400">คัน</span>
            </div>
          </div>

          <div className="bg-slate-50/90 rounded-2xl p-2.5 border border-slate-200/70">
            <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-semibold">
              <Gauge className="w-3.5 h-3.5 text-emerald-600" />
              <span>ความเร็วเฉลี่ย</span>
            </div>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black font-mono text-slate-900">
                {fleet.length > 0 
                  ? Math.round(fleet.reduce((acc, v) => acc + v.currentSpeed, 0) / fleet.length)
                  : 0}
              </span>
              <span className="text-[11px] font-bold text-slate-400">กม./ชม.</span>
            </div>
          </div>

          <div className="bg-slate-50/90 rounded-2xl p-2.5 border border-slate-200/70">
            <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>ผู้ดูแลระบบออนไลน์</span>
            </div>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black font-mono text-slate-900">{presence.connectedAdmins}</span>
              <span className="text-[11px] font-bold text-slate-400">ท่าน</span>
            </div>
          </div>

          <div className="bg-slate-50/90 rounded-2xl p-2.5 border border-slate-200/70">
            <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>ความหน่วงเซิร์ฟเวอร์</span>
            </div>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black font-mono text-slate-900">
                {latency > 0 ? latency : (status === 'connected' ? '12' : '-')}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Realtime Workspace: Left Map & Right Vehicle List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leaflet Map Column (lg:col-span-2) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-3 border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-800">แผนที่ดาวเทียมตำแหน่งรถสด (Live GPS Tracking Map)</span>
            </div>
            {selectedVehicle && (
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                โฟกัส: {selectedVehicle.licensePlate}
              </span>
            )}
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[360px] sm:min-h-[460px]">
            <div ref={mapContainerRef} className="w-full h-full min-h-[360px] sm:min-h-[460px]" />

            {/* Offline Overlay if admin hasn't clicked connect */}
            {status !== 'connected' && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-400 flex flex-col items-center justify-center p-4 text-center">
                <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 max-w-sm border border-white/50 shadow-xl space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                    <Wifi className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">ระบบเรียลไทม์รอการเชื่อมต่อ</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      กดปุ่ม "เชื่อมต่อระบบเรียลไทม์" เพื่อรับส่งข้อมูลสดจากยานพาหนะทุกคันแบบวินาทีต่อวินาที
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleConnect}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                  >
                    เชื่อมต่อตอนนี้
                  </button>
                </div>
              </div>
            )}

            {/* No Active Vehicles Banner */}
            {status === 'connected' && fleet.length === 0 && (
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md rounded-2xl p-3 border border-slate-200/80 shadow-md flex items-center justify-between z-400 text-xs">
                <div className="flex items-center space-x-2 text-slate-700">
                  <Car className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>ยังไม่มีรถออกวิ่งในขณะนี้ (กดปุ่ม "ทดสอบรถจำลอง" ด้านบนเพื่อดูสาธิตการวิ่งได้ทันที)</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSimulation}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shrink-0 cursor-pointer text-[11px]"
                >
                  เริ่มจำลอง
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fleet List & Live Telemetry Inspector */}
        <div className="space-y-4">
          {/* Active Vehicles List */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Car className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">รายการรถที่กำลังเดินทาง ({fleet.length})</h3>
              </div>
              {fleet.length > 0 && (
                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  LIVE
                </span>
              )}
            </div>

            <div className="space-y-2 mt-3 max-h-[300px] overflow-y-auto pr-1">
              {fleet.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <Car className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-xs font-medium">ยังไม่มีรถออกปฏิบัติหน้าที่</p>
                </div>
              ) : (
                fleet.map((v) => {
                  const isSelected = v.tripId === selectedVehicleId;
                  return (
                    <button
                      key={v.tripId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.tripId)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-slate-900 truncate">
                          {v.vehicle}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          v.isPaused
                            ? 'bg-amber-100 text-amber-800'
                            : v.currentSpeed > 0
                            ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {v.isPaused ? 'พักชั่วคราว' : `${v.currentSpeed} กม./ชม.`}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 mt-1 flex items-center space-x-1.5 font-medium">
                        <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {v.licensePlate}
                        </span>
                        <span>•</span>
                        <span className="truncate">{v.driver}</span>
                      </div>

                      <div className="text-[10px] text-slate-500 mt-1.5 truncate flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{v.lastAddress || 'กำลังส่งสัญญาณพิกัด GPS'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Vehicle Telemetry Card */}
          {selectedVehicle && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
                  Telemetry ข้อมูลสด
                </span>
                <span className="text-[10px] font-mono text-slate-300">
                  {new Date(selectedVehicle.lastUpdated).toLocaleTimeString('th-TH')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white/5 rounded-2xl p-2.5 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-semibold block">ความเร็วปัจจุบัน</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {selectedVehicle.currentSpeed}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">กม./ชม.</span>
                </div>

                <div className="bg-white/5 rounded-2xl p-2.5 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-semibold block">จำนวนพิกัดที่ส่ง</span>
                  <span className="text-2xl font-black font-mono text-blue-400">
                    {selectedVehicle.pointsCount}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">จุด</span>
                </div>
              </div>

              <div className="text-xs space-y-1.5 pt-1">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">วัตถุประสงค์:</span>
                  <span className="font-semibold text-white truncate max-w-[170px]">
                    {selectedVehicle.purpose}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">พิกัดละติจูด/ลองจิจูด:</span>
                  <span className="font-mono text-xs text-white">
                    {selectedVehicle.currentLat.toFixed(5)}, {selectedVehicle.currentLng.toFixed(5)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live Activity Terminal Feed */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold text-slate-900">บันทึกกิจกรรมเรียลไทม์ (Live Logs)</h4>
            </div>

            <div className="space-y-1.5 mt-2.5 max-h-40 overflow-y-auto font-mono text-[11px] pr-1">
              {logs.length === 0 ? (
                <div className="text-slate-400 text-center py-4">รอรับแพ็กเกจข้อมูล...</div>
              ) : (
                logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="leading-relaxed flex items-start space-x-1.5">
                    <span className="text-slate-400 shrink-0 font-semibold">[{log.timestamp}]</span>
                    <span className={
                      log.type === 'success' ? 'text-emerald-700 font-semibold' :
                      log.type === 'trip' ? 'text-blue-700 font-semibold' :
                      log.type === 'warning' ? 'text-amber-700 font-semibold' :
                      'text-slate-600'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
