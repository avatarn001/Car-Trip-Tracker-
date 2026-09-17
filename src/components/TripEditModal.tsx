import React, { useState, useEffect } from 'react';
import { Trip, Vehicle } from '../types';
import { X, Save, AlertCircle, Calendar, Gauge, Fuel, Landmark, CircleParking, FileText, User, Car } from 'lucide-react';
import { storage } from '../services/storage';

interface TripEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: Trip | null; // If null, mode is "Create Manual Trip"
  onSave: (trip: Trip) => void;
  vehicles: Vehicle[];
}

const PURPOSE_OPTIONS = [
  'ไปราชการ',
  'ติดต่อหน่วยงาน',
  'ส่งเอกสาร',
  'รับเอกสาร',
  'อื่นๆ...(กรอก)',
];

export const TripEditModal: React.FC<TripEditModalProps> = ({
  isOpen,
  onClose,
  trip,
  onSave,
  vehicles,
}) => {
  const isEditing = Boolean(trip);

  const [driver, setDriver] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [purposeSelect, setPurposeSelect] = useState('ไปราชการ');
  const [customPurpose, setCustomPurpose] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startOdo, setStartOdo] = useState<number | ''>('');
  const [endOdo, setEndOdo] = useState<number | ''>('');
  const [fuel, setFuel] = useState<number | ''>('');
  const [toll, setToll] = useState<number | ''>('');
  const [parking, setParking] = useState<number | ''>('');
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [driversList, setDriversList] = useState<string[]>([]);

  useEffect(() => {
    setDriversList(storage.getDrivers());

    if (trip) {
      setDriver(trip.driver);
      setVehiclePlate(trip.licensePlate || (vehicles[0]?.licensePlate || ''));
      const p = trip.purpose;
      if (PURPOSE_OPTIONS.includes(p)) {
        setPurposeSelect(p);
        setCustomPurpose('');
      } else {
        setPurposeSelect('อื่นๆ...(กรอก)');
        setCustomPurpose(p);
      }
      const tripDate = trip.startTs ? trip.startTs.slice(0, 10) : new Date().toISOString().slice(0, 10);
      setDate(tripDate);
      setStartOdo(trip.startOdo);
      setEndOdo(trip.endOdo || '');
      setFuel(trip.fuel || '');
      setToll(trip.toll || '');
      setParking(trip.parking || '');
      setStartAddress(trip.startAddress || '');
      setEndAddress(trip.endAddress || '');
      setNote(trip.endNote || trip.note || '');
    } else {
      // Manual entry default
      const defaultVeh = vehicles[0];
      setVehiclePlate(defaultVeh ? defaultVeh.licensePlate : '');
      const lastOdo = defaultVeh ? defaultVeh.currentOdo : storage.getLastOdometer();
      setStartOdo(lastOdo || 0);
      setEndOdo(lastOdo ? lastOdo + 20 : 20);
      const drivers = storage.getDrivers();
      setDriver(drivers.length > 0 ? drivers[0] : '');
      setPurposeSelect('ไปราชการ');
      setCustomPurpose('');
      setFuel('');
      setToll('');
      setParking('');
      setStartAddress('');
      setEndAddress('');
      setNote('');
    }
  }, [trip, isOpen, vehicles]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const finalPurpose = purposeSelect === 'อื่นๆ...(กรอก)' ? customPurpose.trim() : purposeSelect;

    if (!driver.trim()) {
      setErrorMsg('กรุณาระบุชื่อผู้ขับขี่');
      return;
    }
    if (!finalPurpose) {
      setErrorMsg('กรุณาระบุหรือกรอกวัตถุประสงค์');
      return;
    }
    if (startOdo === '' || isNaN(Number(startOdo))) {
      setErrorMsg('กรุณาระบุเลขไมล์เริ่มต้น');
      return;
    }
    if (endOdo === '' || isNaN(Number(endOdo))) {
      setErrorMsg('กรุณาระบุเลขไมล์สิ้นสุด');
      return;
    }
    if (Number(endOdo) < Number(startOdo)) {
      setErrorMsg('เลขไมล์สิ้นสุดต้องไม่น้อยกว่าเลขไมล์เริ่มต้น');
      return;
    }

    const calculatedDist = Math.max(0, Number(endOdo) - Number(startOdo));
    const fuelNum = Number(fuel) || 0;
    const tollNum = Number(toll) || 0;
    const parkNum = Number(parking) || 0;
    const totalExp = fuelNum + tollNum + parkNum;

    const matchedCar = vehicles.find((v) => v.licensePlate === vehiclePlate);

    const savedTrip: Trip = trip
      ? {
          ...trip,
          driver: driver.trim(),
          licensePlate: vehiclePlate || trip.licensePlate,
          vehicle: matchedCar ? matchedCar.name : trip.vehicle,
          purpose: finalPurpose,
          startOdo: Number(startOdo),
          endOdo: Number(endOdo),
          odoDistanceKm: calculatedDist,
          matchedDistanceKm: calculatedDist,
          startAddress: startAddress.trim() || trip.startAddress,
          endAddress: endAddress.trim() || trip.endAddress,
          fuel: fuelNum,
          toll: tollNum,
          parking: parkNum,
          totalExpense: totalExp,
          note: note.trim(),
          endNote: note.trim(),
          lastUpdated: new Date().toISOString(),
        }
      : {
          tripId: `TRIP-${date.replace(/-/g, '')}-${Date.now().toString(36)}`,
          status: 'COMPLETED',
          generation: 1,
          driver: driver.trim(),
          licensePlate: vehiclePlate,
          vehicle: matchedCar ? matchedCar.name : undefined,
          purpose: finalPurpose,
          startOdo: Number(startOdo),
          endOdo: Number(endOdo),
          odoDistanceKm: calculatedDist,
          gpsDistanceKm: calculatedDist,
          matchedDistanceKm: calculatedDist,
          distanceSource: 'MANUAL',
          startTs: `${date}T08:30:00.000Z`,
          endTs: `${date}T10:00:00.000Z`,
          durationMin: 90,
          startAddress: startAddress.trim() || undefined,
          endAddress: endAddress.trim() || undefined,
          pointCount: 0,
          fuel: fuelNum,
          toll: tollNum,
          parking: parkNum,
          totalExpense: totalExp,
          receiptCount: 0,
          receipts: [],
          note: note.trim(),
          endNote: note.trim(),
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        };

    // Update vehicle odometer if higher
    if (vehiclePlate && Number(endOdo) > 0) {
      storage.updateVehicleOdometer(vehiclePlate, Number(endOdo));
    }
    // Save driver name
    storage.addDriver(driver.trim());

    onSave(savedTrip);
    onClose();
  };

  const calculatedDist = endOdo !== '' && startOdo !== '' ? Math.max(0, Number(endOdo) - Number(startOdo)) : 0;
  const currentTotalExpense = (Number(fuel) || 0) + (Number(toll) || 0) + (Number(parking) || 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isEditing ? 'แก้ไขข้อมูลการเดินทาง' : 'บันทึกประวัติการเดินทางย้อนหลัง'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isEditing ? 'แก้ไขเลขไมล์ ค่าใช้จ่าย และรายละเอียดทริป' : 'เพิ่มรายการเดินทางสำหรับกรณีลืมเปิด GPS'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {/* Driver */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1 flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>ผู้ขับขี่ *</span>
              </label>
              <input
                type="text"
                list="edit-driver-list"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                placeholder="ชื่อผู้ขับ"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                required
              />
              <datalist id="edit-driver-list">
                {driversList.map((d, i) => (
                  <option key={i} value={d} />
                ))}
              </datalist>
            </div>

            {/* Vehicle Plate */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1 flex items-center space-x-1">
                <Car className="w-3.5 h-3.5 text-slate-400" />
                <span>ทะเบียนรถ</span>
              </label>
              <select
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">(ไม่ระบุ)</option>
                {vehicles.map((v) => (
                  <option key={v.licensePlate} value={v.licensePlate}>
                    {v.licensePlate} - {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Date */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>วันที่เดินทาง *</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white"
                required
              />
            </div>

            {/* Purpose */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">วัตถุประสงค์ *</label>
              <select
                value={purposeSelect}
                onChange={(e) => setPurposeSelect(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white mb-2"
              >
                {PURPOSE_OPTIONS.map((opt, idx) => (
                  <option key={idx} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {purposeSelect === 'อื่นๆ...(กรอก)' && (
                <input
                  type="text"
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                  placeholder="กรุณาระบุวัตถุประสงค์เพิ่มเติม..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white animate-fadeIn"
                  required
                />
              )}
            </div>
          </div>

          {/* Odometers */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 flex items-center space-x-1">
                <Gauge className="w-3.5 h-3.5 text-blue-600" />
                <span>เลขไมล์ (กม.)</span>
              </span>
              <span className="font-bold text-blue-700 font-mono">
                ระยะทาง: +{calculatedDist.toLocaleString()} กม.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">เลขไมล์เริ่มต้น *</label>
                <input
                  type="number"
                  value={startOdo}
                  onChange={(e) => setStartOdo(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">เลขไมล์สิ้นสุด *</label>
                <input
                  type="number"
                  value={endOdo}
                  onChange={(e) => setEndOdo(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                  required
                />
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">ค่าใช้จ่ายเพิ่มเติม (บาท)</span>
              <span className="font-bold text-emerald-700 font-mono">
                รวม: ฿{currentTotalExpense.toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 flex items-center space-x-1">
                  <Fuel className="w-3 h-3 text-amber-600" />
                  <span>ค่าน้ำมัน</span>
                </label>
                <input
                  type="number"
                  value={fuel}
                  onChange={(e) => setFuel(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 flex items-center space-x-1">
                  <Landmark className="w-3 h-3 text-indigo-600" />
                  <span>ค่าทางด่วน</span>
                </label>
                <input
                  type="number"
                  value={toll}
                  onChange={(e) => setToll(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 flex items-center space-x-1">
                  <CircleParking className="w-3 h-3 text-cyan-600" />
                  <span>ค่าจอดรถ</span>
                </label>
                <input
                  type="number"
                  value={parking}
                  onChange={(e) => setParking(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">สถานที่เริ่มต้น</label>
              <input
                type="text"
                value={startAddress}
                onChange={(e) => setStartAddress(e.target.value)}
                placeholder="เช่น อาคารสำนักงานใหญ่"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">สถานที่ปลายทาง</label>
              <input
                type="text"
                value={endAddress}
                onChange={(e) => setEndAddress(e.target.value)}
                placeholder="เช่น สาขาบางรัก"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="font-semibold text-slate-700 block mb-1">หมายเหตุ</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น บันทึกเพิ่มเติม หรือเลขที่ใบเสร็จ"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          {/* Buttons */}
          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/20 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEditing ? 'บันทึกการแก้ไข' : 'บันทึกทริปใหม่'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
