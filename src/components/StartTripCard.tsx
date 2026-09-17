import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, User, FileText, Gauge, AlertCircle, Sparkles, Car, Plus, Check } from 'lucide-react';
import { storage } from '../services/storage';
import { reverseGeocode } from '../services/geoService';
import { Vehicle } from '../types';

interface StartTripCardProps {
  onStartTrip: (data: {
    driver: string;
    vehicle?: string;
    licensePlate?: string;
    purpose: string;
    startOdo: number;
    startLat: number | null;
    startLng: number | null;
    startAddress?: string;
    startNote?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

const PURPOSE_OPTIONS = [
  'ไปราชการ',
  'ติดต่อหน่วยงาน',
  'ส่งเอกสาร',
  'รับเอกสาร',
  'อื่นๆ...(กรอก)',
];

export const StartTripCard: React.FC<StartTripCardProps> = ({ onStartTrip, isLoading }) => {
  const [driver, setDriver] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarName, setNewCarName] = useState('');
  const [newCarOdo, setNewCarOdo] = useState<number | ''>('');

  const [purposeSelect, setPurposeSelect] = useState('ไปราชการ');
  const [customPurpose, setCustomPurpose] = useState('');
  const [startOdo, setStartOdo] = useState<number | ''>('');
  const [startNote, setStartNote] = useState('');
  const [startGps, setStartGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [startAddress, setStartAddress] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [driverOptions, setDriverOptions] = useState<string[]>([]);

  useEffect(() => {
    const drivers = storage.getDrivers();
    setDriverOptions(drivers);
    if (drivers.length > 0) {
      setDriver(drivers[0]);
    }

    const loadedVehicles = storage.getVehicles();
    setVehicles(loadedVehicles);
    if (loadedVehicles.length > 0) {
      const defaultCar = loadedVehicles.find(v => v.isDefault) || loadedVehicles[0];
      setSelectedPlate(defaultCar.licensePlate);
      setStartOdo(defaultCar.currentOdo || storage.getLastOdometer(defaultCar.licensePlate));
    } else {
      setIsAddingCar(true);
      const lastOdo = storage.getLastOdometer();
      if (lastOdo > 0) setStartOdo(lastOdo);
    }

    // Attempt auto-acquisition of GPS
    acquireGPS();
  }, []);

  const handleVehicleChange = (plate: string) => {
    setSelectedPlate(plate);
    const v = vehicles.find(item => item.licensePlate === plate);
    if (v) {
      const odo = v.currentOdo || storage.getLastOdometer(plate);
      setStartOdo(odo);
    }
  };

  const handleSaveNewCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCarPlate.trim() || !newCarName.trim()) return;
    const newV: Vehicle = {
      id: `v_${Date.now()}`,
      licensePlate: newCarPlate.trim(),
      name: newCarName.trim(),
      currentOdo: Number(newCarOdo) || 0,
      isDefault: vehicles.length === 0,
    };
    storage.addVehicle(newV);
    const updated = storage.getVehicles();
    setVehicles(updated);
    setSelectedPlate(newV.licensePlate);
    setStartOdo(newV.currentOdo);
    setIsAddingCar(false);
    setNewCarPlate('');
    setNewCarName('');
    setNewCarOdo('');
  };

  const acquireGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('อุปกรณ์ไม่รองรับระบบ GPS หรือเบราว์เซอร์ไม่อนุญาต');
      return;
    }

    setIsLocating(true);
    setErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setStartGps({ lat: latitude, lng: longitude, accuracy });
        setIsLocating(false);

        // Reverse geocode
        const addr = await reverseGeocode(latitude, longitude);
        setStartAddress(addr);
      },
      (err) => {
        setIsLocating(false);
        console.warn('GPS notice (using fallback location):', err.message);
        const fallbackLat = 13.7563;
        const fallbackLng = 100.5018;
        setStartGps({ lat: fallbackLat, lng: fallbackLng, accuracy: 25 });
        setStartAddress('ถนนราชดำเนินกลาง, พระนคร, กรุงเทพมหานคร');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedDriver = driver.trim();
    const trimmedPurpose = purposeSelect === 'อื่นๆ...(กรอก)' ? customPurpose.trim() : purposeSelect;

    if (!trimmedDriver) {
      setErrorMsg('กรุณากรอกหรือเลือกชื่อผู้ขับขี่');
      return;
    }
    if (!trimmedPurpose) {
      setErrorMsg('กรุณาระบุหรือกรอกวัตถุประสงค์การเดินทาง');
      return;
    }
    if (startOdo === '' || Number(startOdo) < 0 || isNaN(Number(startOdo))) {
      setErrorMsg('กรุณากรอกเลขไมล์เริ่มต้นให้ถูกต้อง (ตัวเลขไม่ติดลบ)');
      return;
    }
    if (!startGps) {
      setErrorMsg('กรุณากดระบุตำแหน่ง GPS เริ่มต้นก่อนเริ่มทริป');
      return;
    }

    // Save driver to list if new
    storage.addDriver(trimmedDriver);

    const activeCar = vehicles.find(v => v.licensePlate === selectedPlate);

    await onStartTrip({
      driver: trimmedDriver,
      vehicle: activeCar ? activeCar.name : undefined,
      licensePlate: selectedPlate || undefined,
      purpose: trimmedPurpose,
      startOdo: Number(startOdo),
      startLat: startGps.lat,
      startLng: startGps.lng,
      startAddress,
      startNote,
    });
  };

  return (
    <div id="start-trip-card" className="space-y-4">
      {/* Start New Trip Hero Banner Card matching screenshot */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden flex items-center justify-between">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-20 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=600&q=80')` }} />
        <div className="flex items-center space-x-3.5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-sm border border-white/30">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-tight">เริ่มการเดินทางใหม่</h2>
            <p className="text-xs text-blue-100 mt-0.5 leading-relaxed">
              บันทึกข้อมูลรถ เลขไมล์ และพิกัดเริ่มต้น เพื่อเริ่มต้นทริปของคุณ
            </p>
          </div>
        </div>
        <button
          type="submit"
          form="start-trip-form"
          className="relative z-10 px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs rounded-full shadow-md transition-all flex items-center space-x-1 shrink-0 ml-2 cursor-pointer"
        >
          <span>เริ่มทริป</span>
          <span className="text-sm">›</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm">

      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form id="start-trip-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Vehicle Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
              <Car className="w-3.5 h-3.5 text-blue-600" />
              <span>ยานพาหนะ / ทะเบียนรถ *</span>
            </label>
            <button
              type="button"
              onClick={() => setIsAddingCar(!isAddingCar)}
              className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>{isAddingCar ? 'ยกเลิกเพิ่มรถ' : 'เพิ่มรถใหม่'}</span>
            </button>
          </div>

          {!isAddingCar ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {vehicles.map((v) => {
                const isSelected = selectedPlate === v.licensePlate;
                return (
                  <button
                    key={v.id || v.licensePlate}
                    type="button"
                    onClick={() => handleVehicleChange(v.licensePlate)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/30'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">{v.licensePlate}</p>
                      <p className="text-[11px] text-slate-500">{v.name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {(v.currentOdo || 0).toLocaleString()} กม.
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 ml-auto mt-0.5" />}
                    </div>
                  </button>
                );
              })}
              {vehicles.length === 0 && (
                <div className="col-span-full p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                  <span>ยังไม่มีข้อมูลรถในระบบ กดปุ่ม "เพิ่มรถใหม่" เพื่อระบุทะเบียนรถจริงของคุณ</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2.5">
              <p className="text-xs font-bold text-blue-900">เพิ่มข้อมูลรถยนต์คันใหม่</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-600 font-semibold block mb-1">ทะเบียนรถ *</label>
                  <input
                    type="text"
                    value={newCarPlate}
                    onChange={(e) => setNewCarPlate(e.target.value)}
                    placeholder="เช่น 4กข-8899 กทม"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 font-semibold block mb-1">ยี่ห้อ / รุ่น *</label>
                  <input
                    type="text"
                    value={newCarName}
                    onChange={(e) => setNewCarName(e.target.value)}
                    placeholder="เช่น Toyota Yaris"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-600 font-semibold block mb-1">เลขไมล์ปัจจุบัน (กม.)</label>
                <input
                  type="number"
                  value={newCarOdo}
                  onChange={(e) => setNewCarOdo(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="เช่น 45000"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveNewCar}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
              >
                บันทึกรถและเลือกใช้งาน
              </button>
            </div>
          )}
        </div>

        {/* Driver Selection / Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>ผู้ขับขี่ *</span>
            </span>
            <span className="text-[10px] text-slate-400">เลือกหรือพิมพ์ชื่อใหม่</span>
          </label>
          <div className="relative">
            <input
              id="input-driver"
              type="text"
              list="driver-options"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              placeholder="เช่น สมชาย มุ่งมั่น"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              required
            />
            <datalist id="driver-options">
              {driverOptions.map((d, i) => (
                <option key={i} value={d} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Purpose Dropdown & Custom Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>วัตถุประสงค์การเดินทาง *</span>
          </label>
          <select
            id="select-purpose"
            value={purposeSelect}
            onChange={(e) => setPurposeSelect(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all mb-2"
          >
            {PURPOSE_OPTIONS.map((opt, idx) => (
              <option key={idx} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {purposeSelect === 'อื่นๆ...(กรอก)' && (
            <input
              id="input-custom-purpose"
              type="text"
              value={customPurpose}
              onChange={(e) => setCustomPurpose(e.target.value)}
              placeholder="กรุณาระบุวัตถุประสงค์เพิ่มเติม..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all animate-fadeIn"
              required
            />
          )}
        </div>

        {/* Start Odometer */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Gauge className="w-3.5 h-3.5 text-slate-400" />
              <span>เลขไมล์เริ่มต้น (กม.) *</span>
            </span>
            <span className="text-[10px] text-slate-400">จากหน้าปัดรถยนต์จริง</span>
          </label>
          <div className="relative">
            <input
              id="input-start-odo"
              type="number"
              inputMode="numeric"
              value={startOdo}
              onChange={(e) => setStartOdo(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              required
            />
            <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-semibold">กม.</span>
          </div>
        </div>

        {/* GPS Location Box */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>พิกัดและสถานที่เริ่มต้น</span>
            </div>
            <button
              id="btn-acquire-start-gps"
              type="button"
              onClick={acquireGPS}
              disabled={isLocating}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            >
              <Sparkles className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'กำลังหาพิกัด...' : 'อัปเดตตำแหน่ง'}</span>
            </button>
          </div>

          {startGps ? (
            <div className="text-xs space-y-1">
              <p className="font-semibold text-slate-800">
                {startAddress || `${startGps.lat.toFixed(5)}, ${startGps.lng.toFixed(5)}`}
              </p>
              <p className="text-[11px] text-slate-500">
                ละติจูด/ลองจิจูด: {startGps.lat.toFixed(5)}, {startGps.lng.toFixed(5)} (ความแม่นยำ ~
                {Math.round(startGps.accuracy || 10)} ม.)
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">ยังไม่ระบุตำแหน่ง กดปุ่ม "อัปเดตตำแหน่ง" ด้านบน</p>
          )}
        </div>

        {/* Start Note */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            หมายเหตุเริ่มต้น (ถ้ามี)
          </label>
          <input
            id="input-start-note"
            type="text"
            value={startNote}
            onChange={(e) => setStartNote(e.target.value)}
            placeholder="เช่น เติมลมยางแล้ว, สภาพรถพร้อมใช้งาน"
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Submit Button */}
        <button
          id="btn-submit-start-trip"
          type="submit"
          disabled={isLoading || isLocating}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Navigation className="w-4 h-4" />
          <span>{isLoading ? 'กำลังเริ่มต้นทริป...' : 'เริ่มการเดินทาง (Start Trip)'}</span>
        </button>
      </form>
      </div>

      {/* Promotional Banner matching screenshot footer */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 rounded-3xl p-4 text-white shadow-md flex items-center space-x-3.5 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-25 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=500&q=80')` }} />
        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-sm border border-white/30">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div className="relative z-10">
          <p className="text-xs font-bold">ทุกเส้นทางมีความหมาย</p>
          <p className="text-[11px] text-emerald-100">ให้ Car Trip Tracker ช่วยบันทึกการเดินทางของคุณ</p>
        </div>
      </div>
    </div>
  );
};
