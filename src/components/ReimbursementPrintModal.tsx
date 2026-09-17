import React, { useState, useMemo } from 'react';
import { Trip, Vehicle } from '../types';
import { Printer, X, FileText, CheckCircle2, Car, User } from 'lucide-react';
import { formatThaiDate } from '../services/geoService';

interface ReimbursementPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  vehicles: Vehicle[];
}

export const ReimbursementPrintModal: React.FC<ReimbursementPrintModalProps> = ({
  isOpen,
  onClose,
  trips,
  vehicles,
}) => {
  const [companyName, setCompanyName] = useState('บริษัท / หน่วยงาน ตัวอย่าง จำกัด');
  const [selectedDriver, setSelectedDriver] = useState('all');
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [mileageRate, setMileageRate] = useState<number | ''>(0); // e.g. 4 THB/km
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));

  // Extract unique drivers
  const drivers = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => {
      if (t.driver) set.add(t.driver);
    });
    return Array.from(set);
  }, [trips]);

  // Filter trips
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (selectedDriver !== 'all' && t.driver !== selectedDriver) return false;
      if (selectedVehicle !== 'all' && t.licensePlate !== selectedVehicle) return false;
      return true;
    });
  }, [trips, selectedDriver, selectedVehicle]);

  // Calculations
  const totals = useMemo(() => {
    let totalKm = 0;
    let totalFuel = 0;
    let totalToll = 0;
    let totalParking = 0;

    filteredTrips.forEach((t) => {
      const dist = Number(t.matchedDistanceKm || t.odoDistanceKm || t.gpsDistanceKm || 0);
      totalKm += dist;
      totalFuel += Number(t.fuel || 0);
      totalToll += Number(t.toll || 0);
      totalParking += Number(t.parking || 0);
    });

    const expenseSubtotal = totalFuel + totalToll + totalParking;
    const rate = Number(mileageRate) || 0;
    const mileageAllowance = Math.round(totalKm * rate * 100) / 100;
    const grandTotal = expenseSubtotal + mileageAllowance;

    return {
      count: filteredTrips.length,
      totalKm: Math.round(totalKm * 10) / 10,
      totalFuel,
      totalToll,
      totalParking,
      expenseSubtotal,
      mileageAllowance,
      grandTotal,
    };
  }, [filteredTrips, mileageRate]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      {/* Container */}
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Modal Controls (Hidden in Print) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">พิมพ์ใบขอเบิกค่าเดินทางและค่าน้ำมัน</h2>
              <p className="text-xs text-slate-500">เอกสารแบบฟอร์มมาตรฐานสำหรับยื่นเบิกฝ่ายบัญชี/การเงิน</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>สั่งพิมพ์ / บันทึก PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Configuration Toolbar (Hidden in Print) */}
        <div className="p-3 bg-white border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs print:hidden">
          <div>
            <label className="text-[11px] text-slate-600 font-semibold block mb-1">ชื่อหน่วยงาน / บริษัท</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-600 font-semibold block mb-1">กรองผู้ขับขี่</label>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              <option value="all">ทุกคน ({trips.length} รายการ)</option>
              {drivers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-600 font-semibold block mb-1">กรองทะเบียนรถ</label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              <option value="all">ทุกคัน</option>
              {vehicles.map((v) => (
                <option key={v.licensePlate} value={v.licensePlate}>{v.licensePlate} ({v.name})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-600 font-semibold block mb-1">ค่าชดเชยระยะทาง (บาท/กม.)</label>
            <input
              type="number"
              value={mileageRate}
              onChange={(e) => setMileageRate(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0 (ถ้าเบิกตามใบเสร็จจริง)"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
            />
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="overflow-y-auto p-6 sm:p-8 flex-1 bg-white text-slate-900 font-sans print:p-0 print:m-0">
          {/* Header */}
          <div className="text-center pb-4 mb-4 border-b-2 border-slate-800">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mb-1">{companyName}</h1>
            <h2 className="text-base font-bold text-slate-800">
              ใบขอเบิกค่าเดินทางและค่าใช้จ่ายยานพาหนะ
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              วันที่จัดทำเอกสาร: {formatThaiDate(claimDate)} | รวม {filteredTrips.length} รายการเดินทาง
            </p>
          </div>

          {/* Meta Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-4">
            <div>
              <span className="text-slate-500 block">ผู้ขอเบิก / ผู้ขับขี่:</span>
              <span className="font-bold text-slate-800">{selectedDriver === 'all' ? 'ทุกผู้ขับขี่' : selectedDriver}</span>
            </div>
            <div>
              <span className="text-slate-500 block">ยานพาหนะ / ทะเบียนรถ:</span>
              <span className="font-bold text-slate-800">{selectedVehicle === 'all' ? 'ทุกคันที่ใช้งาน' : selectedVehicle}</span>
            </div>
            <div>
              <span className="text-slate-500 block">ระยะทางรวมทั้งสิ้น:</span>
              <span className="font-bold text-blue-700 font-mono">{totals.totalKm.toLocaleString()} กม.</span>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold">
                  <th className="py-2 px-2 border-r border-slate-200 text-center w-8">ที่</th>
                  <th className="py-2 px-2 border-r border-slate-200 w-20">วันที่</th>
                  <th className="py-2 px-2 border-r border-slate-200">วัตถุประสงค์ / เส้นทาง</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">เลขไมล์เริ่ม</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">เลขไมล์จบ</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">ระยะทาง</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">น้ำมัน</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">ทางด่วน</th>
                  <th className="py-2 px-2 border-r border-slate-200 text-right w-16">ที่จอดรถ</th>
                  <th className="py-2 px-2 text-right w-20">รวม (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTrips.map((t, idx) => {
                  const km = Number(t.matchedDistanceKm || t.odoDistanceKm || t.gpsDistanceKm || 0);
                  const exp = Number(t.totalExpense || 0);
                  return (
                    <tr key={t.tripId} className="hover:bg-slate-50">
                      <td className="py-2 px-2 border-r border-slate-200 text-center font-medium">{idx + 1}</td>
                      <td className="py-2 px-2 border-r border-slate-200 whitespace-nowrap">
                        {formatThaiDate(t.endTs || t.startTs)}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200">
                        <p className="font-semibold text-slate-800">{t.purpose}</p>
                        {t.startAddress && t.endAddress && (
                          <p className="text-[9px] text-slate-500 truncate max-w-xs">
                            {t.startAddress} ➔ {t.endAddress}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-mono">
                        {t.startOdo ? t.startOdo.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-mono">
                        {t.endOdo ? t.endOdo.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-bold text-slate-700 font-mono">
                        {km > 0 ? km.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-mono">
                        {t.fuel > 0 ? t.fuel.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-mono">
                        {t.toll > 0 ? t.toll.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 border-r border-slate-200 text-right font-mono">
                        {t.parking > 0 ? t.parking.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-900 font-mono">
                        {exp > 0 ? exp.toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td colSpan={5} className="py-2 px-3 text-right border-r border-slate-200">รวมทั้งสิ้น:</td>
                  <td className="py-2 px-2 text-right border-r border-slate-200 font-mono text-blue-700">
                    {totals.totalKm.toLocaleString()} กม.
                  </td>
                  <td className="py-2 px-2 text-right border-r border-slate-200 font-mono">
                    {totals.totalFuel.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right border-r border-slate-200 font-mono">
                    {totals.totalToll.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right border-r border-slate-200 font-mono">
                    {totals.totalParking.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-emerald-700 text-xs">
                    ฿{totals.expenseSubtotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mileage rate addition if configured */}
          {Number(mileageRate) > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs mb-4 flex items-center justify-between font-mono">
              <span className="text-amber-800">
                ค่าชดเชยตามอัตรากิโลเมตร ({totals.totalKm} กม. × {mileageRate} บาท/กม.):
              </span>
              <span className="font-bold text-amber-900">
                ฿{totals.mileageAllowance.toLocaleString()} บาท
              </span>
            </div>
          )}

          {/* Grand Total Summary Box */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between mb-8">
            <div>
              <p className="text-xs text-slate-400">ยอดเงินรวมสุทธิที่ขออนุมัติเบิกจ่าย</p>
              <p className="text-xs text-slate-300">
                (ค่าน้ำมัน, ค่าทางด่วน, ค่าที่จอดรถ {Number(mileageRate) > 0 ? '+ ค่าชดเชยระยะทาง' : ''})
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono">
                ฿{totals.grandTotal.toLocaleString()}
              </span>
              <span className="text-xs ml-1 font-sans">บาท</span>
            </div>
          </div>

          {/* Signatures Section */}
          <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-center">
            <div className="space-y-12">
              <p className="font-semibold text-slate-700">ผู้ขอเบิกเงิน</p>
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="text-slate-500">
                ( {selectedDriver === 'all' ? '..................................................' : selectedDriver} )
              </p>
              <p className="text-[10px] text-slate-400">วันที่: ..... / ..... / .........</p>
            </div>

            <div className="space-y-12">
              <p className="font-semibold text-slate-700">ผู้ตรวจสอบ (บัญชี/ธุรการ)</p>
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="text-slate-500">( .................................................. )</p>
              <p className="text-[10px] text-slate-400">วันที่: ..... / ..... / .........</p>
            </div>

            <div className="space-y-12">
              <p className="font-semibold text-slate-700">ผู้อนุมัติจ่ายเงิน</p>
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="text-slate-500">( .................................................. )</p>
              <p className="text-[10px] text-slate-400">วันที่: ..... / ..... / .........</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
