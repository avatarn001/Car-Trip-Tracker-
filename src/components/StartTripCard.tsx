import React, { useState, useEffect } from 'react';
import { 
  MapPin, Navigation, User, FileText, Gauge, AlertCircle, Sparkles, Car, Plus, 
  CheckCircle2, ChevronRight, UserPlus, Pencil, Map, BarChart3, Settings, X, Check,
  ChevronDown, Trash2, BatteryCharging, Leaf
} from 'lucide-react';
import { storage } from '../services/storage';
import { reverseGeocode } from '../services/geoService';
import { Vehicle } from '../types';

import fortunerImg from '../assets/images/fortuner_white.jpg';
import hondaCityImg from '../assets/images/honda_city_white.jpg';
import isuzuDmaxImg from '../assets/images/isuzu_dmax_white.jpg';
import scenicBannerImg from '../assets/images/scenic_banner.jpg';

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
  onTabChange?: (tab: 'trip' | 'summary' | 'history') => void;
  onOpenSettings?: () => void;
}

const PURPOSE_OPTIONS = [
  'ไปราชการ',
  'ติดต่อประสานงานหน่วยงาน',
  'ส่งเอกสาร / พัสดุราชการ',
  'รับ-ส่งเจ้าหน้าที่ / วิทยากร / คณะกรรมการ',
  'ตรวจเยี่ยมและติดตามโรงเรียนเอกชน',
  'เข้าร่วมการประชุม / สัมมนา',
  'นิเทศ ติดตาม และประเมินผลการจัดการศึกษา',
  'อบรมเชิงปฏิบัติการ',
  'อื่นๆ',
];

export const StartTripCard: React.FC<StartTripCardProps> = ({ 
  onStartTrip, 
  isLoading,
  onTabChange,
  onOpenSettings
}) => {
  const [driver, setDriver] = useState('นายมูฮัมหมัด เจะมะ');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  
  // Dropdown Purpose State
  const [selectedPurpose, setSelectedPurpose] = useState<string>('ไปราชการ');
  const [customPurpose, setCustomPurpose] = useState<string>('');

  // Modals
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isConfirmStartModalOpen, setIsConfirmStartModalOpen] = useState(false);

  // Add Car Form
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarName, setNewCarName] = useState('');
  const [newCarOdo, setNewCarOdo] = useState<number | ''>('');

  // Driver management
  const [driverList, setDriverList] = useState<string[]>([]);
  const [newDriverName, setNewDriverName] = useState('');

  // GPS & Odo
  const [startOdo, setStartOdo] = useState<number | ''>('');
  const [startGps, setStartGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [startAddress, setStartAddress] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Battery Saver state
  const [powerSavingMode, setPowerSavingMode] = useState<boolean>(() => storage.isPowerSavingMode());
  const [gpsIntervalSec, setGpsIntervalSec] = useState<number>(() => storage.getGasConfig().gpsIntervalSeconds || 12);

  useEffect(() => {
    const handleConfigChange = (e: any) => {
      const cfg = e.detail;
      if (cfg) {
        setPowerSavingMode(Boolean(cfg.powerSavingMode));
        setGpsIntervalSec(cfg.gpsIntervalSeconds || 12);
      }
    };
    window.addEventListener('gas-config-changed', handleConfigChange);
    return () => window.removeEventListener('gas-config-changed', handleConfigChange);
  }, []);

  const togglePowerSaving = () => {
    const nextVal = !powerSavingMode;
    const nextSec = nextVal ? (gpsIntervalSec || 12) : 4;
    setPowerSavingMode(nextVal);
    storage.setPowerSavingMode(nextVal, nextSec);
  };

  useEffect(() => {
    // Load drivers
    const loadedDrivers = storage.getDrivers();
    if (loadedDrivers.length > 0) {
      setDriverList(loadedDrivers);
      setDriver(loadedDrivers[0]);
    } else {
      const defaultD = ['นายมูฮัมหมัด เจะมะ'];
      setDriverList(defaultD);
      setDriver(defaultD[0]);
    }

    // Load vehicles (empty by default until user adds)
    const loadedVehicles = storage.getVehicles();
    setVehicles(loadedVehicles);

    if (loadedVehicles.length > 0) {
      const defaultCar = loadedVehicles.find(v => v.isDefault) || loadedVehicles[0];
      setSelectedPlate(defaultCar.licensePlate);
      setStartOdo(defaultCar.currentOdo || 0);
    } else {
      setSelectedPlate('');
      setStartOdo('');
    }

    // Acquire GPS in background
    acquireGPS();
  }, []);

  const acquireGPS = () => {
    if (!navigator.geolocation) {
      console.warn('GPS not supported, using fallback location');
      setStartGps({ lat: 6.8687, lng: 101.3688, accuracy: 15 });
      setStartAddress('สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง, อ.ยะหริ่ง, จ.ปัตตานี');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setStartGps({ lat: latitude, lng: longitude, accuracy });
        setIsLocating(false);
        const addr = await reverseGeocode(latitude, longitude);
        setStartAddress(addr);
      },
      (err) => {
        setIsLocating(false);
        console.warn('GPS error fallback:', err.message);
        setStartGps({ lat: 6.8687, lng: 101.3688, accuracy: 20 });
        setStartAddress('สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง, ปัตตานี');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  const getVehicleImage = (plate: string, name: string) => {
    if (plate.includes('4กข') || name.toLowerCase().includes('fortuner')) {
      return fortunerImg;
    }
    if (plate.includes('9กฮ') || name.toLowerCase().includes('city') || name.toLowerCase().includes('honda')) {
      return hondaCityImg;
    }
    if (plate.includes('1ฒผ') || name.toLowerCase().includes('d-max') || name.toLowerCase().includes('isuzu')) {
      return isuzuDmaxImg;
    }
    return fortunerImg;
  };

  const handleSelectCar = (car: Vehicle) => {
    setSelectedPlate(car.licensePlate);
    setStartOdo(car.currentOdo || storage.getLastOdometer(car.licensePlate));
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

  const handleDeleteCar = (e: React.MouseEvent, plate: string) => {
    e.stopPropagation();
    if (window.confirm(`ต้องการลบข้อมูลรถทะเบียน "${plate}" หรือไม่?`)) {
      storage.deleteVehicle(plate);
      const updated = storage.getVehicles();
      setVehicles(updated);
      if (selectedPlate === plate) {
        if (updated.length > 0) {
          setSelectedPlate(updated[0].licensePlate);
          setStartOdo(updated[0].currentOdo);
        } else {
          setSelectedPlate('');
          setStartOdo('');
        }
      }
    }
  };

  const handleAddNewDriver = () => {
    if (!newDriverName.trim()) return;
    const name = newDriverName.trim();
    storage.addDriver(name);
    const updated = storage.getDrivers();
    setDriverList(updated);
    setDriver(name);
    setNewDriverName('');
    setIsDriverModalOpen(false);
  };

  const handleHeroStartClick = () => {
    if (vehicles.length === 0) {
      setIsAddingCar(true);
      return;
    }
    setIsConfirmStartModalOpen(true);
  };

  const handleConfirmStartTrip = async () => {
    setErrorMsg('');
    if (vehicles.length === 0 || !selectedPlate) {
      setErrorMsg('กรุณาเพิ่มและเลือกรถยนต์ก่อนเริ่มทริป');
      return;
    }

    const finalPurpose = selectedPurpose === 'อื่นๆ' ? customPurpose.trim() : selectedPurpose;
    if (!finalPurpose) {
      setErrorMsg('กรุณาระบุวัตถุประสงค์การเดินทาง');
      return;
    }

    const activeCar = vehicles.find(v => v.licensePlate === selectedPlate) || vehicles[0];

    setIsConfirmStartModalOpen(false);

    await onStartTrip({
      driver: driver.trim(),
      vehicle: activeCar ? activeCar.name : 'รถยนต์ราชการ',
      licensePlate: selectedPlate,
      purpose: finalPurpose,
      startOdo: Number(startOdo) || 0,
      startLat: startGps ? startGps.lat : 6.8687,
      startLng: startGps ? startGps.lng : 101.3688,
      startAddress: startAddress || 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง',
      startNote: '',
    });
  };

  const activeVehicle = vehicles.find(v => v.licensePlate === selectedPlate);

  return (
    <div id="start-trip-card" className="space-y-3 pb-8">
      {/* 1. Hero Card ("เริ่มการเดินทางใหม่") */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 rounded-3xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden flex items-center justify-between">
        {/* Subtle map watermark */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none bg-cover bg-center mix-blend-overlay"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80')` }}
        />
        {/* Faint white pin outline in background */}
        <MapPin className="absolute -top-3 right-28 w-20 h-20 text-white/10 pointer-events-none" />

        <div className="flex items-center space-x-3.5 relative z-10 min-w-0">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-md shrink-0">
            <MapPin className="w-7 h-7 text-blue-600 fill-blue-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white drop-shadow-xs">
              เริ่มการเดินทางใหม่
            </h2>
            <p className="text-xs text-sky-100/95 mt-0.5 leading-snug">
              บันทึกข้อมูลรถ เลขไมล์ และพิกัดเริ่มต้น<br />เพื่อเริ่มต้นทริปของคุณ
            </p>
          </div>
        </div>

        <button
          onClick={handleHeroStartClick}
          disabled={isLoading}
          className="relative z-10 px-4 py-2.5 bg-white text-blue-700 hover:bg-sky-50 active:scale-95 font-bold text-xs sm:text-sm rounded-full shadow-md transition-all flex items-center space-x-1.5 shrink-0 ml-2 cursor-pointer border border-white/50"
        >
          <Navigation className="w-3.5 h-3.5 text-blue-600 fill-blue-600 rotate-45" />
          <span>เริ่มทริป</span>
          <ChevronRight className="w-4 h-4 text-blue-600 ml-0.5" />
        </button>
      </div>

      {/* 2. Bento Grid 4 Action Cards */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {/* ยานพาหนะ */}
        <button
          onClick={() => {
            const el = document.getElementById('vehicle-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-100 shadow-xs hover:shadow-md transition-all text-center flex flex-col items-center group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-2xs">
            <Car className="w-6 h-6 text-blue-600" />
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">ยานพาหนะ</span>
          <span className="text-[10px] text-slate-400 flex items-center mt-0.5">
            Vehicle <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </span>
        </button>

        {/* แผนที่ */}
        <button
          onClick={() => {
            if (onTabChange) onTabChange('trip');
            acquireGPS();
          }}
          className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-100 shadow-xs hover:shadow-md transition-all text-center flex flex-col items-center group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-2xs">
            <Map className="w-6 h-6 text-emerald-600" />
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">แผนที่</span>
          <span className="text-[10px] text-slate-400 flex items-center mt-0.5">
            Map <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </span>
        </button>

        {/* สถิติ */}
        <button
          onClick={() => onTabChange && onTabChange('summary')}
          className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-100 shadow-xs hover:shadow-md transition-all text-center flex flex-col items-center group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-2xs">
            <BarChart3 className="w-6 h-6 text-purple-600" />
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">สถิติ</span>
          <span className="text-[10px] text-slate-400 flex items-center mt-0.5">
            Statistics <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </span>
        </button>

        {/* ตั้งค่า */}
        <button
          onClick={onOpenSettings}
          className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-100 shadow-xs hover:shadow-md transition-all text-center flex flex-col items-center group cursor-pointer relative"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform shadow-2xs">
            <Settings className="w-6 h-6 text-amber-500" />
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">ตั้งค่า</span>
          <span className="text-[10px] text-slate-400 flex items-center mt-0.5">
            Settings <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </span>
          {powerSavingMode && (
            <span className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full shadow-2xs flex items-center space-x-0.5">
              <Leaf className="w-2 h-2" />
              <span>ประหยัด</span>
            </span>
          )}
        </button>
      </div>

      {/* 3. Section: "ยานพาหนะ / ทะเบียนรถ" */}
      <div id="vehicle-section" className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Car className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
              ยานพาหนะ / ทะเบียนรถ
            </h3>
          </div>
          <button
            onClick={() => setIsAddingCar(true)}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มรถใหม่</span>
          </button>
        </div>

        {/* If no vehicles are added yet: clean empty state with "+ เพิ่มข้อมูลรถยนต์" */}
        {vehicles.length === 0 ? (
          <div 
            onClick={() => setIsAddingCar(true)}
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20 rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Car className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              ยังไม่มีข้อมูลรถยนต์ในระบบ
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              กรุณากดเพิ่มข้อมูลรถยนต์เพื่อเริ่มต้นบันทึกการเดินทาง
            </p>
            <button
              type="button"
              className="bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow-xs flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ เพิ่มข้อมูลรถยนต์</span>
            </button>
          </div>
        ) : (
          /* Vehicle Cards Stack */
          <div className="space-y-2.5">
            {vehicles.map((car) => {
              const isSelected = selectedPlate === car.licensePlate;
              const carImg = getVehicleImage(car.licensePlate, car.name);

              return (
                <div
                  key={car.id || car.licensePlate}
                  onClick={() => handleSelectCar(car)}
                  className={`w-full p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500/20 shadow-xs'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* Left: Car Thumbnail */}
                  <div className="w-18 h-12 sm:w-20 sm:h-14 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-1 shrink-0 border border-slate-100">
                    <img
                      src={carImg}
                      alt={car.name}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Middle: License & Model */}
                  <div className="min-w-0 flex-1 px-3">
                    <p className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                      {car.licensePlate}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {car.name}
                    </p>
                  </div>

                  {/* Right: Divider, Odometer, Status, Delete */}
                  <div className="flex items-center space-x-2 shrink-0 pl-2 border-l border-slate-200">
                    <span className="text-xs sm:text-sm font-semibold text-slate-600">
                      {(car.currentOdo || 0).toLocaleString()} กม.
                    </span>
                    {isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-blue-600 fill-blue-600 text-white shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCar(e, car.licensePlate)}
                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors rounded-md"
                      title="ลบข้อมูลรถคันนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Section: "ผู้ขับขี่" (Driver Card) */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium">ผู้ขับขี่</p>
            <p className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
              {driver}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDriverModalOpen(true)}
          className="bg-blue-50/80 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center space-x-1 transition-colors cursor-pointer shrink-0 ml-2"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>เลือกหรือเพิ่มรายชื่อ</span>
          <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
        </button>
      </div>

      {/* 5. Section: "วัตถุประสงค์การเดินทาง *" (Trip Purpose Dropdown) */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center space-x-1.5">
          <FileText className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs sm:text-sm font-bold text-slate-800">
            วัตถุประสงค์การเดินทาง <span className="text-red-500">*</span>
          </h4>
        </div>

        {/* Dropdown Select Component */}
        <div className="relative">
          <select
            value={selectedPurpose}
            onChange={(e) => {
              setSelectedPurpose(e.target.value);
              if (e.target.value !== 'อื่นๆ') {
                setCustomPurpose('');
              }
            }}
            className="w-full bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 font-semibold appearance-none focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer pr-10"
          >
            {PURPOSE_OPTIONS.map((opt) => (
              <option key={opt} value={opt} className="font-medium text-slate-800 py-1">
                {opt === 'อื่นๆ' ? 'อื่นๆ (ระบุเพิ่มเติม...)' : opt}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* Custom text field if 'อื่นๆ' is chosen */}
        {selectedPurpose === 'อื่นๆ' && (
          <div className="bg-slate-50/90 border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all animate-in fade-in duration-150">
            <input
              type="text"
              value={customPurpose}
              onChange={(e) => setCustomPurpose(e.target.value)}
              placeholder="ระบุวัตถุประสงค์การเดินทาง..."
              className="bg-transparent text-xs sm:text-sm text-slate-800 w-full focus:outline-none placeholder:text-slate-400 font-medium"
              autoFocus
            />
            <Pencil className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        )}
      </div>

      {/* 6. Promotional Banner: "ทุกเส้นทางมีความหมาย" */}
      <div className="bg-gradient-to-r from-sky-100/90 via-sky-50 to-emerald-50/80 rounded-2xl p-3 border border-sky-200/60 shadow-xs flex items-center justify-between relative overflow-hidden">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-200 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1 text-blue-800 font-extrabold text-xs sm:text-sm">
              <span className="text-blue-600">›</span>
              <span>ทุกเส้นทางมีความหมาย</span>
            </div>
            <p className="text-[11px] text-slate-600 truncate mt-0.5">
              ให้ Car Trip Tracker ช่วยบันทึกการเดินทางของคุณ
            </p>
          </div>
        </div>

        <div className="w-24 h-12 rounded-xl overflow-hidden shrink-0 ml-2 border border-white shadow-xs">
          <img
            src={scenicBannerImg}
            alt="Scenic banner"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* ========================================================
          MODAL: ADD NEW CAR
         ======================================================== */}
      {isAddingCar && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Car className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">เพิ่มข้อมูลรถยนต์คันใหม่</h3>
              </div>
              <button 
                onClick={() => setIsAddingCar(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCar} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">ทะเบียนรถ *</label>
                <input
                  type="text"
                  value={newCarPlate}
                  onChange={(e) => setNewCarPlate(e.target.value)}
                  placeholder="เช่น 4กข-8899 กทม หรือ กข-1234 ยะลา"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">ยี่ห้อ / รุ่นรถ *</label>
                <input
                  type="text"
                  value={newCarName}
                  onChange={(e) => setNewCarName(e.target.value)}
                  placeholder="เช่น Toyota Fortuner หรือ Isuzu D-Max"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">เลขไมล์เริ่มต้น (กม.)</label>
                <input
                  type="number"
                  value={newCarOdo}
                  onChange={(e) => setNewCarOdo(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="เช่น 124665 หรือ 0"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCar(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  บันทึกรถ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: DRIVER SELECT / ADD
         ======================================================== */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">เลือกหรือเพิ่มรายชื่อผู้ขับขี่</h3>
              </div>
              <button 
                onClick={() => setIsDriverModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {driverList.map((dName, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setDriver(dName);
                    setIsDriverModalOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs font-bold transition-all ${
                    driver === dName
                      ? 'border-blue-500 bg-blue-50/50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span>{dName}</span>
                  {driver === dName && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 block mb-1">เพิ่มรายชื่อผู้ขับขี่ใหม่</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  placeholder="เช่น นายมูฮัมหมัด เจะมะ"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  onClick={handleAddNewDriver}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  เพิ่ม
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CONFIRM START TRIP
         ======================================================== */}
      {isConfirmStartModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Navigation className="w-5 h-5 text-blue-600 rotate-45" />
                <h3 className="font-extrabold text-slate-900 text-base">ยืนยันข้อมูลเพื่อเริ่มทริป</h3>
              </div>
              <button 
                onClick={() => setIsConfirmStartModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Summary Details */}
            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 border border-slate-200/80 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">ยานพาหนะ:</span>
                <span className="font-bold text-slate-900">
                  {activeVehicle ? `${activeVehicle.licensePlate} (${activeVehicle.name})` : selectedPlate}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">ผู้ขับขี่:</span>
                <span className="font-bold text-slate-900">{driver}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">วัตถุประสงค์:</span>
                <span className="font-bold text-slate-900 truncate max-w-[200px]">
                  {selectedPurpose === 'อื่นๆ' ? customPurpose : selectedPurpose}
                </span>
              </div>

              {/* Editable Start Odometer */}
              <div className="py-1">
                <label className="text-slate-600 font-semibold block mb-1">
                  เลขไมล์เริ่มต้น (กม.) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={startOdo}
                    onChange={(e) => setStartOdo(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span className="absolute right-3 top-2 text-slate-400 font-medium">กม.</span>
                </div>
              </div>

              {/* GPS coordinates & reverse geocoded address */}
              <div className="pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between text-slate-600 mb-1">
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>พิกัดเริ่มต้น:</span>
                  </span>
                  <button
                    type="button"
                    onClick={acquireGPS}
                    className="text-blue-600 font-semibold text-[11px] flex items-center space-x-1 hover:underline cursor-pointer"
                  >
                    <Sparkles className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'กำลังค้นหา...' : 'อัปเดตพิกัด'}</span>
                  </button>
                </div>
                <p className="font-medium text-slate-800 text-[11px]">
                  {startAddress || 'สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง'}
                </p>
                {startGps && (
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    ({startGps.lat.toFixed(5)}, {startGps.lng.toFixed(5)}) ความแม่นยำ ~{Math.round(startGps.accuracy || 15)} ม.
                  </p>
                )}
              </div>
              {/* Battery Saver Mode Toggle */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    powerSavingMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {powerSavingMode ? <BatteryCharging className="w-4 h-4" /> : <Leaf className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">โหมดประหยัดพลังงาน</span>
                    <span className="text-[10px] text-slate-500">
                      {powerSavingMode 
                        ? `ดึงพิกัดทุก ${gpsIntervalSec} วินาที (ประหยัดแบตเตอรี่ ~50%)` 
                        : 'ดึงพิกัดทุก 4 วินาที (ความแม่นยำสูงปกติ)'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={togglePowerSaving}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    powerSavingMode 
                      ? 'bg-emerald-600 text-white shadow-2xs' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {powerSavingMode ? 'เปิดใช้งาน' : 'ปิด'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmStartModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmStartTrip}
                disabled={isLoading || isLocating}
                className="flex-2 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/25 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Navigation className="w-4 h-4 rotate-45" />
                <span>{isLoading ? 'กำลังเริ่มต้น...' : 'ยืนยันเริ่มการเดินทาง (Start Trip)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
