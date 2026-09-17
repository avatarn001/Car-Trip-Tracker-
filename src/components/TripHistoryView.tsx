import React, { useState, useMemo } from 'react';
import { Trip, Vehicle, GpsPoint } from '../types';
import { formatThaiDateTime, formatDuration, fetchOsrmRoadDistance } from '../services/geoService';
import { TripMap } from './TripMap';
import { ReimbursementPrintModal } from './ReimbursementPrintModal';
import { TripEditModal } from './TripEditModal';
import {
  Search,
  Calendar,
  Download,
  Eye,
  Fuel,
  Landmark,
  CircleParking,
  MapPin,
  Gauge,
  Clock,
  Receipt,
  User,
  Trash2,
  X,
  Printer,
  Edit,
  Plus,
  Car,
  Flag,
  Sparkles,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { storage } from '../services/storage';

interface TripHistoryViewProps {
  trips: Trip[];
  onDeleteTrip: (tripId: string) => void;
  onUpdateTrip?: (trip: Trip) => void;
  onAddTrip?: (trip: Trip) => void;
  onClearDemoData?: () => void;
  onLoadSampleData?: () => void;
  vehicles?: Vehicle[];
}

export const TripHistoryView: React.FC<TripHistoryViewProps> = ({
  trips,
  onDeleteTrip,
  onUpdateTrip,
  onAddTrip,
  onClearDemoData,
  onLoadSampleData,
  vehicles = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month'>('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [zoomReceiptUrl, setZoomReceiptUrl] = useState<string | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Modals
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null | undefined>(undefined); // undefined=closed, null=create, Trip=edit

  const isDemo = useMemo(() => storage.isDemoMode(), [trips]);

  const handleViewTripDetail = async (trip: Trip) => {
    // If trip has start/end coords but needs road routing geometry instead of straight line
    if (
      trip.startLat &&
      trip.startLng &&
      trip.endLat &&
      trip.endLng &&
      (!trip.points || trip.points.length < 5 || trip.distanceSource !== 'OSRM')
    ) {
      setIsLoadingRoute(true);
      try {
        const osrm = await fetchOsrmRoadDistance(
          trip.startLat,
          trip.startLng,
          trip.endLat,
          trip.endLng,
          trip.waypoints
        );
        if (osrm && osrm.geometry && osrm.geometry.length > 0) {
          const roadPoints: GpsPoint[] = osrm.geometry.map((c, idx) => ({
            seq: idx + 1,
            lat: c[0],
            lng: c[1],
            accuracy: 5,
            speed: 40,
            bearing: 0,
            ts: trip.startTs,
            syncStatus: 0,
          }));

          const updatedTrip: Trip = {
            ...trip,
            matchedDistanceKm: osrm.distanceKm,
            distanceSource: 'OSRM',
            points: roadPoints,
          };
          if (onUpdateTrip) {
            onUpdateTrip(updatedTrip);
          }
          setSelectedTrip(updatedTrip);
          setIsLoadingRoute(false);
          return;
        }
      } catch (e) {
        console.warn('Auto OSRM fetch on view failed:', e);
      } finally {
        setIsLoadingRoute(false);
      }
    }
    setSelectedTrip(trip);
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      // Text search
      const q = searchQuery.toLowerCase().trim();
      const matchText =
        !q ||
        t.driver.toLowerCase().includes(q) ||
        t.purpose.toLowerCase().includes(q) ||
        (t.licensePlate || '').toLowerCase().includes(q) ||
        (t.vehicle || '').toLowerCase().includes(q) ||
        (t.startAddress || '').toLowerCase().includes(q) ||
        (t.endAddress || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q);

      if (!matchText) return false;

      // Date filter
      if (dateFilter === 'all') return true;
      const tripDate = t.endTs || t.startTs;
      if (!tripDate) return false;

      const dateObj = new Date(tripDate);
      const now = new Date();

      if (dateFilter === 'today') {
        return (
          dateObj.getFullYear() === now.getFullYear() &&
          dateObj.getMonth() === now.getMonth() &&
          dateObj.getDate() === now.getDate()
        );
      }

      if (dateFilter === 'month') {
        return (
          dateObj.getFullYear() === now.getFullYear() &&
          dateObj.getMonth() === now.getMonth()
        );
      }

      return true;
    });
  }, [trips, searchQuery, dateFilter]);

  // Aggregate stats of filtered trips
  const totals = useMemo(() => {
    let km = 0;
    let expense = 0;
    filteredTrips.forEach((t) => {
      km += Number(t.matchedDistanceKm || t.odoDistanceKm || t.gpsDistanceKm || 0);
      expense += Number(t.totalExpense || 0);
    });
    return {
      count: filteredTrips.length,
      km: Math.round(km * 10) / 10,
      expense,
    };
  }, [filteredTrips]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredTrips.length) return;

    const headers = [
      'TripId',
      'สถานะ',
      'ผู้ขับขี่',
      'ทะเบียนรถ',
      'วัตถุประสงค์',
      'เลขไมล์เริ่ม',
      'เลขไมล์สิ้นสุด',
      'ระยะทางไมล์(กม.)',
      'ระยะทางGPS(กม.)',
      'ระยะทางคำนวณ(กม.)',
      'เวลาเริ่ม',
      'เวลาสิ้นสุด',
      'ระยะเวลารวม(นาที)',
      'สถานที่เริ่มต้น',
      'สถานที่สิ้นสุด',
      'ค่าน้ำมัน',
      'ค่าทางด่วน',
      'ค่าที่จอดรถ',
      'ค่าใช้จ่ายรวม',
      'หมายเหตุ',
    ];

    const rows = filteredTrips.map((t) => [
      `"${t.tripId}"`,
      `"${t.status}"`,
      `"${t.driver}"`,
      `"${t.licensePlate || ''}"`,
      `"${t.purpose.replace(/"/g, '""')}"`,
      t.startOdo,
      t.endOdo || '',
      t.odoDistanceKm || '',
      t.gpsDistanceKm || '',
      t.matchedDistanceKm || '',
      `"${t.startTs}"`,
      `"${t.endTs || ''}"`,
      t.durationMin || '',
      `"${(t.startAddress || '').replace(/"/g, '""')}"`,
      `"${(t.endAddress || '').replace(/"/g, '""')}"`,
      t.fuel,
      t.toll,
      t.parking,
      t.totalExpense,
      `"${(t.endNote || t.note || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `car_trips_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getReceiptUrlList = (trip: Trip): string[] => {
    if (trip.receipts && trip.receipts.length > 0) {
      return trip.receipts.map((r) => r.data || r.url || '');
    }
    if (Array.isArray(trip.receiptUrls)) {
      return trip.receiptUrls;
    }
    if (typeof trip.receiptUrls === 'string' && trip.receiptUrls.trim()) {
      return trip.receiptUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    }
    return [];
  };

  const handleSaveTrip = (saved: Trip) => {
    if (editingTrip) {
      if (onUpdateTrip) onUpdateTrip(saved);
      if (selectedTrip?.tripId === saved.tripId) {
        setSelectedTrip(saved);
      }
    } else {
      if (onAddTrip) onAddTrip(saved);
    }
  };

  return (
    <div id="trip-history-view" className="space-y-4">
      {/* Top Banner: Real Mode vs Demo Mode Notice */}
      {isDemo ? (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-amber-200 shrink-0" />
            <div>
              <p className="text-xs font-bold">กำลังแสดงข้อมูลตัวอย่าง (Demo Mode)</p>
              <p className="text-[11px] text-amber-100">
                คุณสามารถล้างข้อมูลตัวอย่างเพื่อเริ่มต้นใช้งานจริงด้วยเลขไมล์และรถของคุณเอง
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm('ต้องการล้างข้อมูลตัวอย่างเพื่อเริ่มใช้งานจริงหรือไม่?')) {
                if (onClearDemoData) onClearDemoData();
              }
            }}
            className="px-3.5 py-1.5 bg-white text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs transition-all shadow-xs shrink-0 cursor-pointer"
          >
            เริ่มใช้งานจริง (ล้างข้อมูลตัวอย่าง)
          </button>
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold">โหมดใช้งานจริง (Real Mode)</p>
            <p className="text-blue-700 text-[11px]">พร้อมบันทึกการเดินทางจริงผ่าน GPS หรือกดปุ่ม "บันทึกทริปย้อนหลัง"</p>
          </div>
          <button
            onClick={() => {
              if (onLoadSampleData) onLoadSampleData();
            }}
            className="px-3 py-1.5 bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 font-bold rounded-xl text-xs flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>โหลดข้อมูลตัวอย่างสำหรับทดสอบ</span>
          </button>
        </div>
      ) : null}

      {/* Main Filter & Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Row 1: Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <button
              id="btn-print-reimbursement"
              onClick={() => setShowPrintModal(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์ใบเบิกค่าเดินทาง</span>
            </button>

            <button
              id="btn-add-manual-trip"
              onClick={() => setEditingTrip(null)}
              className="flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ บันทึกทริปย้อนหลัง</span>
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!filteredTrips.length}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            title="ส่งออกไฟล์ CSV สำหรับเปิดใน Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ส่งออก CSV</span>
          </button>
        </div>

        {/* Row 2: Search & Filter Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาตามผู้ขับ, ทะเบียน, วัตถุประสงค์, สถานที่..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Quick Date Pills */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateFilter === 'today'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              วันนี้
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateFilter === 'month'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เดือนนี้
            </button>
          </div>
        </div>

        {/* Totals info strip */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            พบทั้งหมด <strong className="text-slate-800">{totals.count}</strong> ทริป
          </span>
          <div className="flex items-center space-x-3">
            <span>
              ระยะทางรวม: <strong className="text-slate-800">{totals.km} กม.</strong>
            </span>
            <span>
              ค่าใช้จ่ายรวม: <strong className="text-blue-600">{totals.expense.toLocaleString()} บาท</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Trips List */}
      {filteredTrips.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold text-slate-600">ไม่พบประวัติการเดินทาง</p>
          <p className="text-xs text-slate-400 mt-1">
            กดปุ่ม "+ บันทึกทริปย้อนหลัง" หรือเริ่มบันทึกทริปใหม่ที่แท็บ "เริ่มเดินทาง"
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrips.map((trip) => {
            const distance = trip.matchedDistanceKm || trip.odoDistanceKm || trip.gpsDistanceKm || 0;
            const rcptList = getReceiptUrlList(trip);

            return (
              <div
                key={trip.tripId}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-blue-400/60 hover:shadow-md transition-all group relative"
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                        {trip.driver}
                      </span>
                      {trip.licensePlate && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center space-x-1">
                          <Car className="w-3 h-3" />
                          <span>{trip.licensePlate}</span>
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {trip.status === 'COMPLETED' ? 'เสร็จสิ้น' : 'กำลังเดินทาง'}
                      </span>
                      {trip.distanceSource && (
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {trip.distanceSource}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700">{trip.purpose}</p>
                  </div>

                  {/* Actions: Edit & Delete */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTrip(trip);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="แก้ไขทริป"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('ยืนยันลบทริปนี้ออกจากประวัติหรือไม่?')) {
                          onDeleteTrip(trip.tripId);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="ลบทริป"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Date & Duration */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatThaiDateTime(trip.endTs || trip.startTs)}</span>
                  </span>
                  {trip.durationMin ? (
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDuration(trip.durationMin)}</span>
                    </span>
                  ) : null}
                </div>

                {/* Waypoints preview if any */}
                {trip.waypoints && trip.waypoints.length > 0 && (
                  <div className="mb-3 flex items-center space-x-1 text-[11px] text-blue-700 bg-blue-50/60 px-2.5 py-1 rounded-lg border border-blue-100">
                    <Flag className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>แวะพัก {trip.waypoints.length} จุด: </span>
                    <span className="truncate text-slate-700">
                      {trip.waypoints.map((w) => w.name).join(' ➔ ')}
                    </span>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3">
                  <div>
                    <span className="text-[10px] text-slate-500 block">ระยะทาง</span>
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      {distance.toLocaleString()} <span className="text-[10px] font-normal font-sans">กม.</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">เลขไมล์</span>
                    <span className="font-mono text-slate-700 text-xs">
                      {trip.startOdo.toLocaleString()} ➔ {trip.endOdo ? trip.endOdo.toLocaleString() : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">ค่าน้ำมัน</span>
                    <span className="font-mono text-slate-700 text-xs">
                      {trip.fuel > 0 ? `฿${trip.fuel.toLocaleString()}` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">ค่าใช้จ่ายรวม</span>
                    <span className="font-bold text-blue-700 font-mono text-sm">
                      {trip.totalExpense > 0 ? `฿${trip.totalExpense.toLocaleString()}` : '-'}
                    </span>
                  </div>
                </div>

                {/* Locations / Route */}
                {(trip.startAddress || trip.endAddress) && (
                  <div className="text-xs text-slate-600 space-y-1 mb-3">
                    {trip.startAddress && (
                      <p className="flex items-start space-x-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="truncate">ต้นทาง: {trip.startAddress}</span>
                      </p>
                    )}
                    {trip.endAddress && (
                      <p className="flex items-start space-x-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span className="truncate">ปลายทาง: {trip.endAddress}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Footer Bar: Receipts & Detail Button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center space-x-2 text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Receipt className="w-3.5 h-3.5 text-slate-400" />
                      <span>ใบเสร็จ: {rcptList.length} ใบ</span>
                    </span>
                  </div>

                  <button
                    onClick={() => handleViewTripDetail(trip)}
                    disabled={isLoadingRoute}
                    className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingRoute ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{isLoadingRoute ? 'กำลังคำนวณเส้นทาง...' : 'ดูรายละเอียดและแผนที่'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Trip Detail Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-bold text-sm text-slate-900">{selectedTrip.driver}</span>
                  {selectedTrip.licensePlate && (
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {selectedTrip.licensePlate}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {selectedTrip.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{selectedTrip.purpose}</p>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => {
                    const t = selectedTrip;
                    setSelectedTrip(null);
                    setEditingTrip(t);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>แก้ไข</span>
                </button>
                <button
                  onClick={() => setSelectedTrip(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Odometer and Route Numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">ระยะทางรวม</span>
                  <span className="text-base font-black text-blue-700 font-mono">
                    {(selectedTrip.matchedDistanceKm || selectedTrip.odoDistanceKm || 0).toLocaleString()} กม.
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">เลขไมล์เริ่มต้น</span>
                  <span className="text-base font-bold text-slate-800 font-mono">
                    {selectedTrip.startOdo.toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block">เลขไมล์สิ้นสุด</span>
                  <span className="text-base font-bold text-slate-800 font-mono">
                    {selectedTrip.endOdo ? selectedTrip.endOdo.toLocaleString() : '-'}
                  </span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[10px] text-emerald-700 block">ค่าใช้จ่ายรวม</span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    ฿{selectedTrip.totalExpense.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Waypoints if any */}
              {selectedTrip.waypoints && selectedTrip.waypoints.length > 0 && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1.5">
                  <p className="font-bold text-blue-900 flex items-center space-x-1.5">
                    <Flag className="w-3.5 h-3.5 text-blue-600" />
                    <span>จุดแวะพักระหว่างทาง ({selectedTrip.waypoints.length})</span>
                  </p>
                  <div className="space-y-1">
                    {selectedTrip.waypoints.map((wp, i) => (
                      <div key={wp.id} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{i + 1}. {wp.name}</p>
                          {wp.address && <p className="text-[10px] text-slate-500">{wp.address}</p>}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(wp.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Map */}
              <div>
                <p className="font-bold text-slate-700 mb-1.5">แผนที่และพิกัดเส้นทาง</p>
                <TripMap
                  points={selectedTrip.points || []}
                  startPoint={
                    selectedTrip.startLat && selectedTrip.startLng
                      ? { lat: selectedTrip.startLat, lng: selectedTrip.startLng }
                      : null
                  }
                  endPoint={
                    selectedTrip.endLat && selectedTrip.endLng
                      ? { lat: selectedTrip.endLat, lng: selectedTrip.endLng }
                      : null
                  }
                  height="220px"
                />
              </div>

              {/* Receipts Preview */}
              <div>
                <p className="font-bold text-slate-700 mb-2 flex items-center space-x-1.5">
                  <Receipt className="w-4 h-4 text-slate-500" />
                  <span>ใบเสร็จรับเงินที่แนบไว้</span>
                </p>
                {getReceiptUrlList(selectedTrip).length === 0 ? (
                  <p className="text-slate-400 italic">ไม่มีรูปใบเสร็จแนบในทริปนี้</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {getReceiptUrlList(selectedTrip).map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => setZoomReceiptUrl(url)}
                        className="aspect-square rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity bg-slate-50"
                      >
                        <img src={url} alt={`ใบเสร็จ ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {(selectedTrip.endNote || selectedTrip.note) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-semibold text-slate-700 block mb-0.5">หมายเหตุ:</span>
                  <p className="text-slate-600">{selectedTrip.endNote || selectedTrip.note}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Lightbox */}
      {zoomReceiptUrl && (
        <div
          onClick={() => setZoomReceiptUrl(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-2xl max-h-[90vh]">
            <img src={zoomReceiptUrl} alt="ขยายใบเสร็จ" className="max-w-full max-h-[90vh] rounded-lg object-contain" />
            <button
              onClick={() => setZoomReceiptUrl(null)}
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Reimbursement Print Modal */}
      <ReimbursementPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        trips={trips}
        vehicles={vehicles}
      />

      {/* Trip Edit / Create Manual Modal */}
      {editingTrip !== undefined && (
        <TripEditModal
          isOpen={true}
          trip={editingTrip}
          onClose={() => setEditingTrip(undefined)}
          onSave={handleSaveTrip}
          vehicles={vehicles}
        />
      )}
    </div>
  );
};
