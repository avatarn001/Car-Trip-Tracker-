import React, { useState, useEffect } from 'react';
import { ActiveTripState, GpsPoint, ReceiptItem } from '../types';
import { MapPin, X, Camera, Plus, AlertCircle, Sparkles, Receipt, Fuel, Landmark, CircleParking } from 'lucide-react';
import { reverseGeocode, calculateTrackDistanceKm } from '../services/geoService';

interface EndTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrip: ActiveTripState;
  points: GpsPoint[];
  onSubmitEnd: (data: {
    endOdo: number;
    endLat: number | null;
    endLng: number | null;
    endAddress?: string;
    endNote?: string;
    fuel: number;
    toll: number;
    parking: number;
    receipts: ReceiptItem[];
  }) => Promise<void>;
  isSubmitting: boolean;
}

export const EndTripModal: React.FC<EndTripModalProps> = ({
  isOpen,
  onClose,
  activeTrip,
  points,
  onSubmitEnd,
  isSubmitting,
}) => {
  const gpsKm = calculateTrackDistanceKm(points);
  // Estimate end odometer by adding GPS distance to start odometer
  const estimatedEndOdo = Math.round(activeTrip.startOdo + (gpsKm > 0 ? gpsKm : 10));

  const [endOdo, setEndOdo] = useState<number | ''>(estimatedEndOdo);
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [endAddress, setEndAddress] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Expenses
  const [fuel, setFuel] = useState<number | ''>('');
  const [toll, setToll] = useState<number | ''>('');
  const [parking, setParking] = useState<number | ''>('');
  const [endNote, setEndNote] = useState('');

  // Receipts
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Auto-populate end coordinates with last GPS point or acquire fresh GPS
      if (points.length > 0) {
        const lastPt = points[points.length - 1];
        setEndLat(lastPt.lat);
        setEndLng(lastPt.lng);
        reverseGeocode(lastPt.lat, lastPt.lng).then(setEndAddress);
      } else {
        acquireEndGPS();
      }
    }
  }, [isOpen, points]);

  if (!isOpen) return null;

  const acquireEndGPS = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    setErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setEndLat(latitude);
        setEndLng(longitude);
        setIsLocating(false);
        const addr = await reverseGeocode(latitude, longitude);
        setEndAddress(addr);
      },
      (err) => {
        setIsLocating(false);
        // Fallback default
        if (activeTrip.startLat && activeTrip.startLng) {
          setEndLat(activeTrip.startLat + 0.02);
          setEndLng(activeTrip.startLng + 0.02);
          setEndAddress('กรุงเทพมหานคร');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (receipts.length >= 5) {
      setErrorMsg('สามารถแนบใบเสร็จได้สูงสุด 5 รูป');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image using canvas max 1024px
        const maxDim = 1024;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);

          const newReceipt: ReceiptItem = {
            id: `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            slot: receipts.length,
            name: file.name,
            mimeType: 'image/jpeg',
            data: compressedBase64,
          };

          setReceipts([...receipts, newReceipt]);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeReceipt = (index: number) => {
    const updated = receipts.filter((_, i) => i !== index).map((r, idx) => ({ ...r, slot: idx }));
    setReceipts(updated);
  };

  const odoDistance = endOdo !== '' ? Number(endOdo) - Number(activeTrip.startOdo) : 0;
  const totalExpense = (Number(fuel) || 0) + (Number(toll) || 0) + (Number(parking) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (endOdo === '' || isNaN(Number(endOdo))) {
      setErrorMsg('กรุณากรอกเลขไมล์สิ้นสุด');
      return;
    }

    const numEndOdo = Number(endOdo);
    if (numEndOdo < activeTrip.startOdo) {
      setErrorMsg(`เลขไมล์สิ้นสุด (${numEndOdo.toLocaleString()}) ต้องไม่น้อยกว่าเลขไมล์เริ่มต้น (${activeTrip.startOdo.toLocaleString()})`);
      return;
    }

    if (endLat === null || endLng === null) {
      setErrorMsg('กรุณาระบุพิกัด GPS สิ้นสุด');
      return;
    }

    await onSubmitEnd({
      endOdo: numEndOdo,
      endLat,
      endLng,
      endAddress,
      endNote,
      fuel: Number(fuel) || 0,
      toll: Number(toll) || 0,
      parking: Number(parking) || 0,
      receipts,
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        id="end-trip-modal"
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-5 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900">สิ้นสุดการเดินทาง</h3>
            <p className="text-xs text-slate-500">
              ผู้ขับ: <span className="font-semibold text-slate-700">{activeTrip.driver}</span> · เลขไมล์เริ่ม: {activeTrip.startOdo.toLocaleString()} กม.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* End Odometer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span>เลขไมล์สิ้นสุด (กม.) *</span>
              {odoDistance > 0 && (
                <span className="text-xs font-bold text-emerald-600">
                  วิ่งไป: +{odoDistance.toLocaleString()} กม.
                </span>
              )}
            </label>
            <div className="relative">
              <input
                id="input-end-odo"
                type="number"
                inputMode="numeric"
                value={endOdo}
                onChange={(e) => setEndOdo(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-semibold">กม.</span>
            </div>
          </div>

          {/* End Location & GPS */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>พิกัดสิ้นสุด</span>
              </span>
              <button
                type="button"
                onClick={acquireEndGPS}
                disabled={isLocating}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
              >
                <Sparkles className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'กำลังหาพิกัด...' : 'ระบุตำแหน่งใหม่อีกครั้ง'}</span>
              </button>
            </div>
            <p className="text-xs font-medium text-slate-800">
              {endAddress || (endLat && endLng ? `${endLat.toFixed(5)}, ${endLng.toFixed(5)}` : 'ยังไม่ได้ระบุ')}
            </p>
          </div>

          {/* Expenses Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-400" />
                <span>ค่าใช้จ่ายการเดินทาง (บาท)</span>
              </span>
              <span className="text-xs font-bold text-blue-600">
                รวม: {totalExpense.toLocaleString()} บาท
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1 flex items-center space-x-1">
                  <Fuel className="w-3 h-3 text-amber-500" />
                  <span>ค่าน้ำมัน</span>
                </label>
                <input
                  id="input-expense-fuel"
                  type="number"
                  placeholder="0"
                  value={fuel}
                  onChange={(e) => setFuel(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 text-right"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1 flex items-center space-x-1">
                  <Landmark className="w-3 h-3 text-blue-500" />
                  <span>ค่าทางด่วน</span>
                </label>
                <input
                  id="input-expense-toll"
                  type="number"
                  placeholder="0"
                  value={toll}
                  onChange={(e) => setToll(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 text-right"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1 flex items-center space-x-1">
                  <CircleParking className="w-3 h-3 text-emerald-500" />
                  <span>ค่าที่จอดรถ</span>
                </label>
                <input
                  id="input-expense-parking"
                  type="number"
                  placeholder="0"
                  value={parking}
                  onChange={(e) => setParking(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 text-right"
                />
              </div>
            </div>
          </div>

          {/* Receipts Attachment (up to 5) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                <span>รูปถ่ายใบเสร็จ / บิลค่าน้ำมัน ({receipts.length}/5)</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {receipts.map((r, idx) => (
                <div key={r.id || idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                  <img src={r.data} alt="Receipt thumbnail" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeReceipt(idx)}
                    className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {receipts.length < 5 && (
                <label className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-blue-600 transition-colors bg-slate-50">
                  <Plus className="w-5 h-5" />
                  <span className="text-[9px] font-semibold mt-0.5">แนบรูป</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* End Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              หมายเหตุเมื่อสิ้นสุดการเดินทาง
            </label>
            <textarea
              id="input-end-note"
              rows={2}
              value={endNote}
              onChange={(e) => setEndNote(e.target.value)}
              placeholder="เช่น เดินทางถึงปลายทางเรียบร้อย นำเอกสารส่งฝ่ายธุรการแล้ว"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
            >
              กลับไปหน้าขับรถ
            </button>
            <button
              id="btn-confirm-end-trip"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/25 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'กำลังบันทึกและปิดทริป...' : 'ยืนยันและปิดทริป'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
