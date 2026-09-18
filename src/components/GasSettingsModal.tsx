import React, { useState } from 'react';
import { GasConfig, SyncQueueItem } from '../types';
import { storage } from '../services/storage';
import { gasService } from '../services/gasService';
import {
  X,
  Cloud,
  Key,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Code,
  FileSpreadsheet,
  Lock,
  PlayCircle,
  Globe,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Battery,
  BatteryCharging,
  Zap,
  Gauge,
  Leaf,
  Smartphone,
  Sliders,
  Info,
} from 'lucide-react';
import { GAS_CODE_GS } from '../services/gasCode';

interface GasSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GasConfig;
  onSaveConfig: (cfg: GasConfig) => void;
  queue: SyncQueueItem[];
  onFlushQueue: () => Promise<void>;
}

export const GasSettingsModal: React.FC<GasSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  queue,
  onFlushQueue,
}) => {
  const [scriptUrl, setScriptUrl] = useState(config.scriptUrl || '');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(config.spreadsheetUrl || '');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [enabled, setEnabled] = useState(config.enabled);
  const [powerSavingMode, setPowerSavingMode] = useState<boolean>(Boolean(config.powerSavingMode));
  const [gpsIntervalSeconds, setGpsIntervalSeconds] = useState<number>(config.gpsIntervalSeconds || 12);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'battery' | 'settings' | 'guide' | 'queue'>('battery');
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [activeFaq, setActiveFaq] = useState<string | null>('permission');

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(GAS_CODE_GS);
      } else {
        throw new Error('Clipboard API not available');
      }
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = GAS_CODE_GS;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Temporarily save to test
    const tempConfig: GasConfig = {
      ...config,
      scriptUrl: scriptUrl.trim(),
      spreadsheetUrl: spreadsheetUrl.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
    };
    storage.saveGasConfig(tempConfig);

    const res = await gasService.testConnection();
    setIsTesting(false);
    setTestResult(res);

    if (res.ok) {
      tempConfig.isConnected = true;
      tempConfig.version = res.version;
      onSaveConfig(tempConfig);
    }
  };

  const handleSave = () => {
    const updated: GasConfig = {
      ...config,
      scriptUrl: scriptUrl.trim(),
      spreadsheetUrl: spreadsheetUrl.trim(),
      apiKey: apiKey.trim(),
      enabled,
      powerSavingMode,
      gpsIntervalSeconds,
    };
    onSaveConfig(updated);
    storage.saveGasConfig(updated);
    onClose();
  };

  const toggleFaq = (key: string) => {
    setActiveFaq(activeFaq === key ? null : key);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="gas-settings-modal"
        className="bg-white w-full max-w-xl rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">ตั้งค่าระบบ (Settings)</h3>
              <p className="text-[11px] text-slate-500">โหมดประหยัดพลังงาน & การเชื่อมต่อ Google Sheets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('battery')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 shrink-0 ${
              activeSubTab === 'battery'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
            <span>โหมดประหยัดพลังงาน</span>
            {powerSavingMode && (
              <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                เปิดอยู่
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 shrink-0 ${
              activeSubTab === 'settings'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-blue-600" />
            <span>Google Sheets (GAS)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('guide')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 shrink-0 ${
              activeSubTab === 'guide'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>คู่มือติดตั้ง & แก้ Error</span>
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              4 ขั้นตอน
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('queue')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1 shrink-0 ${
              activeSubTab === 'queue'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>คิวรอซิงก์</span>
            {queue.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {queue.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Battery Saver Mode Tab */}
          {activeSubTab === 'battery' && (
            <div className="space-y-4">
              {/* Main Battery Saver Toggle Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                powerSavingMode
                  ? 'bg-gradient-to-br from-emerald-50 to-teal-50/60 border-emerald-300 shadow-xs'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      powerSavingMode ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {powerSavingMode ? <BatteryCharging className="w-5 h-5" /> : <Battery className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-extrabold text-slate-900">
                          โหมดประหยัดพลังงาน (Battery Saver Mode)
                        </span>
                        {powerSavingMode && (
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                            <Leaf className="w-2.5 h-2.5" />
                            <span>เปิดใช้งาน</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        ลดความถี่ในการดึงพิกัด GPS เพื่อยืดอายุการใช้งานแบตเตอรี่ขณะเปิดหน้าจอทิ้งไว้ระหว่างขับขี่
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={powerSavingMode}
                      onChange={(e) => setPowerSavingMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* Status Callout */}
                <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs">
                  <span className="text-slate-600">สถานะปัจจุบัน:</span>
                  <span className={`font-bold ${powerSavingMode ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {powerSavingMode
                      ? `🍃 กำลังประหยัดพลังงาน (ดึงพิกัดทุก ${gpsIntervalSeconds} วินาที)`
                      : '⚡ โหมดความละเอียดสูงปกติ (ดึงพิกัดทุก 4 วินาที)'}
                  </span>
                </div>
              </div>

              {/* GPS Frequency Selector */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Gauge className="w-4 h-4 text-blue-600" />
                  <span>ความถี่ในการดึงพิกัด GPS (GPS Polling Interval)</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Option 1: High Accuracy Normal (4s) */}
                  <button
                    type="button"
                    onClick={() => {
                      setGpsIntervalSeconds(4);
                      setPowerSavingMode(false);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      !powerSavingMode && gpsIntervalSeconds === 4
                        ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center space-x-1">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span>โหมดปกติ</span>
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          ทุก 4 วิ
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        ความละเอียดสูงสุด เส้นทางละเอียดทุกโค้ง เหมาะเมื่อมีสายชาร์จ
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Recommended Power Saver (12s) */}
                  <button
                    type="button"
                    onClick={() => {
                      setGpsIntervalSeconds(12);
                      setPowerSavingMode(true);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                      powerSavingMode && gpsIntervalSeconds === 12
                        ? 'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="absolute -top-2 right-2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-2xs">
                      แนะนำ
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-950 flex items-center space-x-1">
                          <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ประหยัดพลังงาน</span>
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                          ทุก 12 วิ
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        ยืดอายุแบตเตอรี่ได้ 2-3 เท่า บันทึกเส้นทางแม่นยำครบถ้วน
                      </p>
                    </div>
                  </button>

                  {/* Option 3: Ultra Saver (20s) */}
                  <button
                    type="button"
                    onClick={() => {
                      setGpsIntervalSeconds(20);
                      setPowerSavingMode(true);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      powerSavingMode && gpsIntervalSeconds === 20
                        ? 'border-teal-500 bg-teal-50/90 ring-2 ring-teal-500/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-teal-950 flex items-center space-x-1">
                          <Battery className="w-3.5 h-3.5 text-teal-600" />
                          <span>ประหยัดขั้นสูง</span>
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-200 text-teal-900">
                          ทุก 20 วิ
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        ประหยัดแบตเตอรี่สูงสุด เหมาะกับเดินทางไกลหรือแบตเตอรี่ต่ำ
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Power Saving Advice & Benefits */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
                <div className="font-bold flex items-center space-x-1.5 text-slate-900">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>การทำงานและประโยชน์ของโหมดประหยัดพลังงาน:</span>
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600 pl-5 list-disc">
                  <li>
                    <strong>ลดการตื่นของชิปเซ็ต GPS:</strong> การเว้นช่วงดึงพิกัดช่วยลดอุณหภูมิความร้อนของโทรศัพท์และลดการใช้พลังงานของฮาร์ดแวร์ GNSS
                  </li>
                  <li>
                    <strong>ลดการคำนวณและประมวลผลหน้าจอ:</strong> หน้าจอแผนที่ไม่ต้องวาดเส้นทางซ้ำซ้อนทุกวินาที ช่วยให้แบตเตอรี่หมดช้าลงอย่างเห็นได้ชัด
                  </li>
                  <li>
                    <strong>ระบบทำงานขณะปิดหน้าจอ:</strong> แม้จะปิดจอโทรศัพท์ ระบบยังมี Silent Audio Keep-Alive บันทึกพิกัดต่อเนื่องตามช่วงเวลาที่กำหนด
                  </li>
                </ul>
              </div>
            </div>
          )}
          {activeSubTab === 'settings' && (
            <div className="space-y-4">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">เปิดใช้งานการซิงก์ออนไลน์</span>
                  <span className="text-[11px] text-slate-500">
                    เมื่อปิดระบบจะจัดเก็บข้อมูลทั้งหมดในเครื่อง (Offline Mode)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Web App URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Apps Script Web App URL *
                </label>
                <input
                  type="url"
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  URL ที่ได้จากการ Deploy Web App (ลงท้ายด้วย <code className="text-slate-600 font-mono">/exec</code>)
                </p>
              </div>

              {/* Spreadsheet URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Google Sheet URL (ลิงก์ไฟล์ Google Sheets)</span>
                </label>
                <input
                  type="url"
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  ลิงก์ไฟล์ Google Sheet ของคุณ เพื่อให้ปุ่มบนเมนูด้านบนเปิดเข้าไฟล์ชีตนั้นได้ทันที
                </p>
              </div>

              {/* Mobile API Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Key className="w-3 h-3 text-slate-400" />
                  <span>Mobile API Key (ไม่บังคับ)</span>
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="เว้นว่างไว้ได้ (ใส่เฉพาะเมื่อมีการตั้งค่าใน Script Properties)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !scriptUrl.trim()}
                  className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ (Ping / Healthcheck)'}</span>
                </button>

                {testResult && (
                  <div
                    className={`mt-2.5 p-3 rounded-xl text-xs flex flex-col space-y-1.5 border ${
                      testResult.ok
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      {testResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      )}
                      <div className="flex-1 font-medium">{testResult.message}</div>
                    </div>

                    {!testResult.ok && (
                      <div className="pt-1 pl-6">
                        <button
                          type="button"
                          onClick={() => setActiveSubTab('guide')}
                          className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center space-x-1"
                        >
                          <span>เปิดดูวิธีแก้ไขข้อผิดพลาดในคู่มือ</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Queue Tab */}
          {activeSubTab === 'queue' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">
                  รายการออฟไลน์ที่รอส่งขึ้นชีต: <strong>{queue.length}</strong> รายการ
                </span>
                <button
                  onClick={onFlushQueue}
                  disabled={queue.length === 0}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  ส่งขึ้นชีตทันที
                </button>
              </div>

              {queue.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6">
                  ไม่มีข้อมูลค้างในคิว ระบบซิงก์เป็นปัจจุบันทั้งหมด
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {queue.map((item, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex justify-between font-bold text-slate-800">
                        <span className="uppercase text-blue-600">{item.action}</span>
                        <span className="text-slate-400 text-[10px] font-mono">{item.requestId}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        เวลาบันทึก: {new Date(item.createdAt).toLocaleTimeString('th-TH')} · ลองใหม่: {item.retries} ครั้ง
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installation & Troubleshooting Guide Tab */}
          {activeSubTab === 'guide' && (
            <div className="space-y-5 text-xs text-slate-700 leading-relaxed">
              {/* Copy Code Action Box */}
              <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 flex items-center justify-between shadow-xs">
                <div>
                  <div className="font-bold text-sm text-blue-950 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>โค้ดสคริปต์ Code.gs (V5.3.9 ล่าสุด)</span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    แก้บั๊ก Regex, ปลดล็อกสิทธิ์อัตโนมัติ และรองรับ 37 คอลัมน์
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm transition-all"
                >
                  {isCodeCopied ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>คัดลอกสำเร็จ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-white" />
                      <span>คัดลอกโค้ด Code.gs</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code Preview Toggle */}
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowCodePreview(!showCodePreview)}
                  className="font-semibold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>{showCodePreview ? 'ซ่อนตัวอย่างโค้ด' : 'คลิกดูตัวอย่างโค้ดสคริปต์'}</span>
                </button>
                <span className="text-slate-400">ขนาด 25 KB / พร้อมทำงานทันที</span>
              </div>

              {showCodePreview && (
                <div className="relative">
                  <pre className="p-3 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-xl max-h-52 overflow-y-auto leading-tight border border-slate-700">
                    {GAS_CODE_GS}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-white rounded-md text-[10px] flex items-center space-x-1"
                  >
                    {isCodeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isCodeCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                  </button>
                </div>
              )}

              {/* Step-by-Step Installation Cards */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  ขั้นตอนการติดตั้ง (4 ขั้นตอนใช้งานได้ทันที)
                </h4>

                {/* Step 1 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center space-x-2 font-bold text-slate-900">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-mono">
                      1
                    </span>
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>นำโค้ดไปวางใน Google Sheet</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7">
                    เปิดไฟล์ <strong>Google Sheets</strong> ของคุณ &gt; ไปที่เมนู{' '}
                    <strong>ส่วนขยาย (Extensions)</strong> &gt; <strong>Apps Script</strong> &gt; ลบโค้ดเดิมใน{' '}
                    <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-blue-600">
                      Code.gs
                    </code>{' '}
                    ออกทั้งหมด แล้วกดปุ่ม <strong>"คัดลอกโค้ด Code.gs"</strong> ด้านบนไปวาง แล้วกด{' '}
                    <strong>บันทึก (Ctrl + S)</strong>
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-slate-900">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-mono">
                      2
                    </span>
                    <Lock className="w-4 h-4 text-indigo-600" />
                    <span>การตั้งค่า SPREADSHEET_ID (แก้ Error Missing Property)</span>
                  </div>
                  <div className="text-[11px] text-slate-600 pl-7 space-y-1.5">
                    <div className="p-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium">
                      💡 <strong>เทคนิคประหยัดเวลา:</strong> หากคุณเปิด Apps Script มาจากเมนู "ส่วนขยาย" ใน Google Sheets
                      โดยตรง โค้ดเวอร์ชันล่าสุดนี้จะตรวจพบ Google Sheet อัตโนมัติ{' '}
                      <strong>สามารถข้ามไปขั้นตอนที่ 3 ได้เลย โดยไม่ต้องตั้งค่า ID!</strong>
                    </div>

                    <p>
                      <strong>หากสร้างสคริปต์แบบแยกไฟล์ (Standalone):</strong> ให้ไปที่เมนูรูปฟันเฟือง{' '}
                      <strong>การตั้งค่าโครงการ (Project Settings)</strong> ด้านซ้าย &gt; เลื่อนลงไปที่{' '}
                      <strong>คุณสมบัติของสคริปต์ (Script Properties)</strong> &gt; เพิ่มรายการ:
                    </p>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[10px] space-y-1">
                      <div className="text-slate-500">// ตัวอย่าง URL ของ Google Sheets:</div>
                      <div className="text-slate-800 break-all">
                        https://docs.google.com/spreadsheets/d/
                        <span className="bg-amber-100 text-amber-900 font-bold px-1 rounded">
                          1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
                        </span>
                        /edit
                      </div>
                      <div className="pt-1 text-slate-700">
                        • Property:{' '}
                        <strong className="text-blue-600">SPREADSHEET_ID</strong>
                        <br />• Value:{' '}
                        <span className="text-amber-900 font-semibold">
                          (คัดลอกเฉพาะรหัสตัวอักษรระหว่าง /d/ ถึง /edit)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center space-x-2 font-bold text-slate-900">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-mono">
                      3
                    </span>
                    <PlayCircle className="w-4 h-4 text-blue-600" />
                    <span>กด Run ฟังก์ชัน setupProject (ให้สิทธิ์การเข้าถึง)</span>
                  </div>
                  <div className="text-[11px] text-slate-600 pl-7 space-y-1">
                    <p>
                      กลับไปที่หน้าแก้ไขโค้ด (ไอคอน <code className="font-mono">&lt;&gt;</code>) &gt; ที่แถบด้านบนเลือกฟังก์ชัน{' '}
                      <code className="font-mono bg-white px-1 py-0.5 rounded border text-blue-600 font-bold">
                        setupProject
                      </code>{' '}
                      แล้วกดปุ่ม <strong>เรียกใช้ (Run)</strong>
                    </p>
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-0.5">
                      <span className="font-bold">⚠️ หากขึ้นหน้าต่าง "ต้องได้รับสิทธิ์ (Authorization required)":</span>
                      <ol className="list-decimal pl-4 space-y-0.5 text-[10px]">
                        <li>กดปุ่ม <strong>ตรวจสอบสิทธิ์ (Review permissions)</strong></li>
                        <li>เลือกบัญชี Google ของคุณ</li>
                        <li>กด <strong>ขั้นสูง (Advanced)</strong> ที่มุมล่างซ้าย</li>
                        <li>กด <strong>ไปที่ ... (ไม่ปลอดภัย) / Go to ... (unsafe)</strong></li>
                        <li>กด <strong>อนุญาต (Allow)</strong></li>
                      </ol>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      เมื่อรันสำเร็จ ระบบจะสร้างชีต <code className="font-mono">Trips</code>,{' '}
                      <code className="font-mono">GpsStage</code>,{' '}
                      <code className="font-mono">MonthlySummary</code> พร้อม 37 คอลัมน์ให้อัตโนมัติ
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center space-x-2 font-bold text-slate-900">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-mono">
                      4
                    </span>
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span>Deploy Web App ให้สิทธิ์ทุกคน (แก้ Error Not Authorized)</span>
                  </div>
                  <div className="text-[11px] text-slate-600 pl-7 space-y-1.5">
                    <p>
                      กดปุ่มสีน้ำเงินมุมขวาบน <strong>ทำให้ใช้งานได้ (Deploy)</strong> &gt;{' '}
                      <strong>การทำให้ใช้งานได้ใหม่ (New deployment)</strong> &gt; เลือกประเภท{' '}
                      <strong>เว็บแอป (Web app)</strong> และตั้งค่าดังนี้:
                    </p>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1">
                      <div>
                        • ดำเนินการในฐานะ (Execute as):{' '}
                        <strong className="text-blue-700">ตัวฉันเอง (Me)</strong>
                      </div>
                      <div>
                        • ผู้ที่มีสิทธิ์เข้าถึง (Who has access):{' '}
                        <strong className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                          ทุกคน (Anyone)
                        </strong>{' '}
                        <span className="text-[10px] text-rose-600 font-semibold">
                          *(ห้ามเลือก Only myself มิฉะนั้นมือถือจะเข้าไม่ได้)*
                        </span>
                      </div>
                    </div>
                    <p>
                      กด <strong>ทำให้ใช้งานได้ (Deploy)</strong> แล้วคัดลอก{' '}
                      <strong>URL เว็บแอป (Web App URL)</strong> มาวางในแท็บ{' '}
                      <button
                        onClick={() => setActiveSubTab('settings')}
                        className="text-blue-600 font-bold underline hover:text-blue-800"
                      >
                        "การเชื่อมต่อ"
                      </button>{' '}
                      ในหน้าต่างนี้ แล้วกดบันทึก
                    </p>
                  </div>
                </div>
              </div>

              {/* Troubleshooting Accordions */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>วิธีแก้ Error ที่พบบ่อย (Troubleshooting)</span>
                </div>

                {/* FAQ 1: Permission Denied */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFaq('permission')}
                    className="w-full p-3 flex items-center justify-between text-left font-semibold text-xs text-slate-800 hover:bg-slate-100"
                  >
                    <span className="flex items-center space-x-2 text-rose-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Error: "You do not have permission to access the requested document"</span>
                    </span>
                    {activeFaq === 'permission' ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {activeFaq === 'permission' && (
                    <div className="p-3 bg-white border-t border-slate-200 text-[11px] text-slate-600 space-y-1.5">
                      <p>
                        <strong>สาเหตุหลัก:</strong>
                      </p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                        <li>
                          <strong>เผลอเอา Script ID มาใส่:</strong> ในหน้าการตั้งค่า Apps Script จะมีช่อง "รหัสสคริปต์ (Script ID)" หากนำรหัสนั้นมาใส่ใน SPREADSHEET_ID จะเกิด Error นี้ทันที{' '}
                          <span className="text-emerald-700 font-semibold">
                            (วิธีแก้: ถ้าเปิด Apps Script จากใน Google Sheets ให้ลบรายการ SPREADSHEET_ID ใน Script Properties ออกไปเลย โค้ดจะดึงชีตให้อัตโนมัติ)
                          </span>
                        </li>
                        <li>
                          <strong>ล็อกอินหลายบัญชีพร้อมกัน:</strong> หากใน Chrome ล็อกอินทั้ง Gmail ส่วนตัว และอีเมลองค์กร Apps Script จะสับสนสิทธิ์{' '}
                          <span className="text-blue-700 font-semibold">
                            (วิธีแก้: ให้เปิด Google Sheets ในหน้าต่างไม่ระบุตัวตน Incognito บัญชีเดียว)
                          </span>
                        </li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* FAQ 2: Missing Property */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFaq('missing')}
                    className="w-full p-3 flex items-center justify-between text-left font-semibold text-xs text-slate-800 hover:bg-slate-100"
                  >
                    <span className="flex items-center space-x-2 text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Error: "Set Script Property SPREADSHEET_ID first"</span>
                    </span>
                    {activeFaq === 'missing' ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {activeFaq === 'missing' && (
                    <div className="p-3 bg-white border-t border-slate-200 text-[11px] text-slate-600 space-y-1.5">
                      <p>
                        <strong>สาเหตุ:</strong> โค้ดในหน้า Apps Script ของคุณยังเป็นเวอร์ชันเก่า (บรรทัด 795 เขียนดักไว้ว่าต้องมี ID)
                      </p>
                      <p>
                        <strong>วิธีแก้ไข:</strong> กดปุ่ม <strong>"คัดลอกโค้ด Code.gs"</strong> ด้านบน นำไปวางทับใน Apps Script แล้วกด <strong>บันทึก (Ctrl + S)</strong> โค้ดเวอร์ชันล่าสุดจะปลดล็อกให้ดึง Google Sheet อัตโนมัติ และสั่งรัน setupProject ได้ทันทีครับ
                      </p>
                    </div>
                  )}
                </div>

                {/* FAQ 3: Not authorized on ping */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFaq('not_authorized')}
                    className="w-full p-3 flex items-center justify-between text-left font-semibold text-xs text-slate-800 hover:bg-slate-100"
                  >
                    <span className="flex items-center space-x-2 text-rose-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>ทดสอบการเชื่อมต่อแล้วขึ้น "Not authorized"</span>
                    </span>
                    {activeFaq === 'not_authorized' ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {activeFaq === 'not_authorized' && (
                    <div className="p-3 bg-white border-t border-slate-200 text-[11px] text-slate-600 space-y-1.5">
                      <p>
                        <strong>1. แก้ไขด้วย Script Properties:</strong>
                        <br />
                        ไปที่ Apps Script &gt; การตั้งค่าโครงการ (รูปฟันเฟือง) &gt; Script Properties &gt; เพิ่ม Property: <code className="font-mono text-blue-700">ALLOW_INSECURE_DEV</code> = <code className="font-mono text-emerald-700">true</code> แล้วกดบันทึก
                      </p>
                      <p>
                        <strong>2. อย่าลืม Deploy เป็นเวอร์ชันใหม่:</strong>
                        <br />
                        ทุกครั้งที่มีการแก้ไขโค้ดใน Apps Script ต้องกด <strong>ทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong>จัดการการทำให้ใช้งานได้ (Manage deployments)</strong> &gt; กดไอคอนดินสอ ✏️ &gt; เลือกเวอร์ชันเป็น <strong>"เวอร์ชันใหม่ (New version)"</strong> แล้วกด Deploy เสมอ มิฉะนั้น Web App จะยังคงรันโค้ดเก่าอยู่
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {activeSubTab === 'guide' ? 'ทำตาม 4 ขั้นตอนนี้เพื่อเริ่มซิงก์ข้อมูล' : 'ระบบรองรับการทำงานออฟไลน์ในตัว'}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
            >
              ปิด
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

