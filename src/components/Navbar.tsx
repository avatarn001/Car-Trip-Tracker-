import React, { useState, useEffect } from 'react';
import { Car, Map, BarChart3, Settings, Bell, User, Cloud, CloudOff, RefreshCw, Wifi, WifiOff, FileSpreadsheet, Shield, ChevronRight, Radio } from 'lucide-react';
import { GasConfig, UserProfile } from '../types';
import { realtimeService, RealtimeConnectionStatus } from '../services/realtimeService';
import officeHeaderImg from '../assets/images/office_yaring_header.jpg';
import opepLogoImg from '../assets/images/opep_logo.png';

interface NavbarProps {
  activeTab: 'trip' | 'summary' | 'history' | 'live';
  onTabChange: (tab: 'trip' | 'summary' | 'history' | 'live') => void;
  isOnline: boolean;
  queueCount: number;
  gasConfig: GasConfig;
  onOpenSettings: () => void;
  onForceSync: () => void;
  isSyncing: boolean;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  isOnline,
  queueCount,
  gasConfig,
  onOpenSettings,
  onForceSync,
  isSyncing,
  currentUser,
  onLogout,
}) => {
  const isAdmin = currentUser?.email === 'junko223@gmail.com';
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>(realtimeService.getStatus());
  const [liveCount, setLiveCount] = useState<number>(realtimeService.getFleet().length);

  useEffect(() => {
    const unsubStatus = realtimeService.onStatusChange((s) => setRealtimeStatus(s));
    const unsubFleet = realtimeService.onFleetUpdate((fleet) => setLiveCount(fleet.length));
    return () => {
      unsubStatus();
      unsubFleet();
    };
  }, []);

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-sky-100 via-sky-50 to-slate-50 pb-2">
      {/* Scenic background illustration header with user's office photo */}
      <div
        className="absolute top-0 left-0 right-0 h-44 bg-cover bg-center opacity-95 pointer-events-none transition-all"
        style={{ backgroundImage: `url(${officeHeaderImg})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-sky-50/85 to-slate-50 backdrop-blur-[0.5px]" />
      </div>

      <header className="relative z-10 max-w-4xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between">
        {/* Logo & Title & Office */}
        <div className="flex items-center space-x-3">
          {/* Official OPEP Emblem Logo */}
          <div className="w-13 h-13 rounded-full bg-white p-0.5 shadow-md border-2 border-amber-400/90 shrink-0 overflow-hidden flex items-center justify-center ring-2 ring-black/10">
            <img
              src={opepLogoImg}
              alt="ตราสัญลักษณ์ สช."
              className="w-full h-full object-contain rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 drop-shadow-xs whitespace-nowrap">
                Car Trip <span className="text-blue-600">Tracker</span>
              </h1>
            </div>
            <p className="text-xs font-medium text-slate-700 mt-0.5 whitespace-nowrap">
              บันทึกเส้นทาง • เก็บทุกการเดินทางของคุณ
            </p>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5 whitespace-nowrap">
              สำนักงานการศึกษาเอกชนอำเภอยะหริ่ง
            </p>
          </div>
        </div>

        {/* Right Status Controls & Profile */}
        <div className="flex items-center space-x-2 shrink-0 ml-2">
          {/* Admin Realtime Live Monitor Quick Button */}
          <button
            type="button"
            onClick={() => onTabChange('live')}
            className={`px-2.5 py-1.5 rounded-full text-xs font-extrabold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer border ${
              activeTab === 'live'
                ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-500/20'
                : realtimeStatus === 'connected'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="ระบบติดตามรถสดแบบเรียลไทม์ (Admin Fleet Monitor)"
          >
            <Radio className={`w-3.5 h-3.5 ${
              realtimeStatus === 'connected' ? 'text-emerald-600 animate-pulse' : 'text-slate-500'
            }`} />
            <span className="hidden sm:inline">
              {realtimeStatus === 'connected' ? 'แอดมินออนไลน์สด' : 'แอดมินสด'}
            </span>
            {liveCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                {liveCount}
              </span>
            )}
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => alert('ไม่มีการแจ้งเตือนใหม่')}
            className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200/90 flex items-center justify-center text-blue-600 hover:bg-slate-50 transition-colors relative cursor-pointer"
            title="การแจ้งเตือน"
          >
            <Bell className="w-4 h-4 text-blue-600 fill-blue-600/20" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`w-10 h-10 rounded-full shadow-sm border flex items-center justify-center transition-colors relative cursor-pointer ${
              gasConfig.powerSavingMode
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 ring-2 ring-emerald-500/20'
                : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
            }`}
            title={gasConfig.powerSavingMode ? 'ตั้งค่าระบบ (โหมดประหยัดพลังงานเปิดใช้งานอยู่)' : 'ตั้งค่าระบบ & โหมดประหยัดพลังงาน'}
          >
            <Settings className={`w-4 h-4 ${gasConfig.powerSavingMode ? 'text-emerald-600' : 'text-slate-600'}`} />
            {gasConfig.powerSavingMode && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            )}
          </button>

          {/* User Profile Avatar */}
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full bg-blue-600 text-white shadow-md flex items-center justify-center hover:bg-blue-700 transition-colors cursor-pointer border-2 border-white"
            title={currentUser?.email || 'บัญชีผู้ใช้'}
          >
            <User className="w-5 h-5 text-white" />
          </button>
        </div>
      </header>
    </div>
  );
};
