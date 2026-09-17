import React, { useMemo } from 'react';
import { Trip, MonthlySummary } from '../types';
import { storage } from '../services/storage';
import { BarChart3, TrendingUp, Car, Clock, DollarSign, Fuel, Landmark, CircleParking, User, RefreshCw, Calendar } from 'lucide-react';

interface SummaryDashboardProps {
  trips: Trip[];
  onRefresh: () => void;
  isSyncing: boolean;
}

export const SummaryDashboard: React.FC<SummaryDashboardProps> = ({ trips, onRefresh, isSyncing }) => {
  const completedTrips = useMemo(() => trips.filter((t) => t.status === 'COMPLETED'), [trips]);

  // Calculations for Today & This Month
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);

    const todayTrips = completedTrips.filter((t) => (t.endTs || t.startTs).startsWith(todayStr));
    const monthTrips = completedTrips.filter((t) => (t.endTs || t.startTs).startsWith(monthStr));

    const monthKm = monthTrips.reduce(
      (sum, t) => sum + Number(t.matchedDistanceKm || t.odoDistanceKm || t.gpsDistanceKm || 0),
      0
    );

    const monthDurationMin = monthTrips.reduce((sum, t) => sum + Number(t.durationMin || 0), 0);
    const monthDrivingHours = Math.round((monthDurationMin / 60) * 10) / 10;

    const monthFuel = monthTrips.reduce((sum, t) => sum + Number(t.fuel || 0), 0);
    const monthToll = monthTrips.reduce((sum, t) => sum + Number(t.toll || 0), 0);
    const monthParking = monthTrips.reduce((sum, t) => sum + Number(t.parking || 0), 0);
    const monthTotalExpense = monthFuel + monthToll + monthParking;

    return {
      todayCount: todayTrips.length,
      monthCount: monthTrips.length,
      monthKm: Math.round(monthKm * 10) / 10,
      monthDrivingHours,
      monthFuel,
      monthToll,
      monthParking,
      monthTotalExpense,
    };
  }, [completedTrips]);

  // Driver leaderboard
  const driverStats = useMemo(() => {
    const map = new Map<
      string,
      { driver: string; trips: number; km: number; expenses: number }
    >();

    completedTrips.forEach((t) => {
      const d = t.driver || 'ไม่ระบุ';
      const km = Number(t.matchedDistanceKm || t.odoDistanceKm || 0);
      const exp = Number(t.totalExpense || 0);

      if (!map.has(d)) {
        map.set(d, { driver: d, trips: 1, km, expenses: exp });
      } else {
        const cur = map.get(d)!;
        cur.trips += 1;
        cur.km += km;
        cur.expenses += exp;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.km - a.km);
  }, [completedTrips]);

  // Monthly breakdown records
  const monthlySummaries: MonthlySummary[] = useMemo(() => {
    return storage.getMonthlySummaries();
  }, [completedTrips]);

  return (
    <div id="summary-dashboard" className="space-y-5">
      {/* Top Header with Reload button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">สรุปภาพรวมและสถิติ</h2>
          <p className="text-xs text-slate-500">รายงานการใช้รถ ระยะทาง และค่าใช้จ่าย</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isSyncing}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          <span>โหลดข้อมูลใหม่</span>
        </button>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-600">ทริปวันนี้</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.todayCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">รายการเดินทางวันนี้</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-600">ทริปเดือนนี้</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.monthCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">ประจำเดือนปัจจุบัน</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-600">ระยะทางรวมเดือนนี้</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.monthKm.toLocaleString()}
            <span className="text-xs font-medium text-slate-500 ml-1">กม.</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">คำนวณจาก Odo และ GPS</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-600">ชั่วโมงขับขี่สะสม</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.monthDrivingHours}
            <span className="text-xs font-medium text-slate-500 ml-1">ชม.</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">ชั่วโมงบนท้องถนน</p>
        </div>
      </div>

      {/* Expense Breakdown Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">ค่าใช้จ่ายรวมประจำเดือน</h3>
            <p className="text-xs text-slate-500">ค่าน้ำมัน, ค่าทางด่วน และค่าที่จอดรถ</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-blue-600">
              {stats.monthTotalExpense.toLocaleString()} บาท
            </span>
          </div>
        </div>

        {/* Expense distribution bar */}
        {stats.monthTotalExpense > 0 ? (
          <div className="space-y-3">
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${(stats.monthFuel / stats.monthTotalExpense) * 100}%` }}
                className="bg-amber-500 h-full"
                title="ค่าน้ำมัน"
              />
              <div
                style={{ width: `${(stats.monthToll / stats.monthTotalExpense) * 100}%` }}
                className="bg-blue-500 h-full"
                title="ค่าทางด่วน"
              />
              <div
                style={{ width: `${(stats.monthParking / stats.monthTotalExpense) * 100}%` }}
                className="bg-emerald-500 h-full"
                title="ค่าที่จอดรถ"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <div>
                  <span className="text-slate-500 block text-[11px]">ค่าน้ำมัน</span>
                  <span className="font-bold text-slate-800">{stats.monthFuel.toLocaleString()} บ.</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <span className="text-slate-500 block text-[11px]">ค่าทางด่วน</span>
                  <span className="font-bold text-slate-800">{stats.monthToll.toLocaleString()} บ.</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <span className="text-slate-500 block text-[11px]">ค่าที่จอด</span>
                  <span className="font-bold text-slate-800">{stats.monthParking.toLocaleString()} บ.</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic text-center py-2">ยังไม่มีบันทึกค่าใช้จ่ายในเดือนนี้</p>
        )}
      </div>

      {/* Driver Performance Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center space-x-2">
          <User className="w-4 h-4 text-slate-400" />
          <span>สถิติรายบุคคล (ผู้ขับขี่)</span>
        </h3>

        {driverStats.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">ยังไม่มีข้อมูลผู้ขับขี่</p>
        ) : (
          <div className="space-y-2.5">
            {driverStats.map((ds, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">{ds.driver}</span>
                    <span className="text-[11px] text-slate-500">{ds.trips} ทริปที่เดินทาง</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-black text-xs text-slate-800 block">
                    {Math.round(ds.km * 10) / 10} กม.
                  </span>
                  <span className="text-[11px] font-semibold text-blue-600">
                    {ds.expenses.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Summary Sheet Format Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">ตารางสรุปรายเดือน (MonthlySummary)</h3>
            <p className="text-[11px] text-slate-500">ตรงตามแบบชีตระบบ Google Sheets</p>
          </div>
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {monthlySummaries.length} บันทึก
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/70">
                <th className="py-2.5 px-3 font-semibold">เดือน</th>
                <th className="py-2.5 px-3 font-semibold">ผู้ขับขี่</th>
                <th className="py-2.5 px-3 font-semibold text-center">จำนวนทริป</th>
                <th className="py-2.5 px-3 font-semibold text-right">ระยะทาง (กม.)</th>
                <th className="py-2.5 px-3 font-semibold text-right">ค่าใช้จ่ายรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlySummaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                    ยังไม่มีข้อมูลสรุปรายเดือน
                  </td>
                </tr>
              ) : (
                monthlySummaries.map((ms, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{ms.month}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{ms.driver}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{ms.tripCount}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                      {ms.distanceKm.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-blue-600">
                      {ms.totalExpense.toLocaleString()} บ.
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
