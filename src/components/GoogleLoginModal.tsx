import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Shield, User, LogIn, CheckCircle2 } from 'lucide-react';

interface GoogleLoginModalProps {
  isOpen: boolean;
  onLogin: (user: UserProfile) => void;
}

export const GoogleLoginModal: React.FC<GoogleLoginModalProps> = ({ isOpen, onLogin }) => {
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  if (!isOpen) return null;

  const handleQuickLogin = (email: string, name: string) => {
    onLogin({
      email,
      name,
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    });
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail) return;
    const email = customEmail.trim();
    const name = customName.trim() || email.split('@')[0];
    onLogin({
      email,
      name,
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    });
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white text-center">
          <div className="w-14 h-14 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-3">
            <svg className="w-8 h-8" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.95H1.14v3.15C3.16 21.28 7.24 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.25c-.25-.72-.38-1.49-.38-2.25s.13-1.53.38-2.25V6.6H1.14C.41 8.08 0 9.74 0 12s.41 3.92 1.14 5.4l4.14-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.24 0 3.16 2.72 1.14 6.6l4.14 3.15c.95-2.84 3.6-4.95 6.72-4.95z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold">เข้าสู่ระบบ Car Trip Tracker</h2>
          <p className="text-xs text-blue-100 mt-1">กรุณาล็อกอินด้วยบัญชี Google เพื่อใช้งานระบบ</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="space-y-2.5">
            <button
              onClick={() => handleQuickLogin('junko223@gmail.com', 'Admin (junko223)')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 transition-all text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  A
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 flex items-center space-x-1.5">
                    <span>Admin (junko223@gmail.com)</span>
                    <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded font-semibold">
                      ผู้ดูแลระบบ
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">เห็นเมนูตั้งค่า (Settings)</div>
                </div>
              </div>
              <Shield className="w-5 h-5 text-blue-600" />
            </button>

            <button
              onClick={() => handleQuickLogin('driver.yaring@gmail.com', 'นายมูฮัมหมัด เจะมะ')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                  ม
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                    <span>นายมูฮัมหมัด เจะมะ (คนขับรถ)</span>
                    <span className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.2 rounded">
                      ผู้ใช้งานทั่วไป
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">driver.yaring@gmail.com (ไม่เห็นเมนูตั้งค่า)</div>
                </div>
              </div>
              <User className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-[11px]">หรือใช้อีเมล Google อื่น</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <form onSubmit={handleCustomLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Google Gmail Address
              </label>
              <input
                type="email"
                required
                placeholder="your.name@gmail.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ชื่อ-นามสกุล (ไม่บังคับ)
              </label>
              <input
                type="text"
                placeholder="ระบุชื่อของคุณ"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-colors shadow-md"
            >
              <LogIn className="w-4 h-4" />
              <span>เข้าสู่ระบบด้วย Google</span>
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center pt-2">
            หมายเหตุ: บัญชี <span className="font-semibold text-slate-600">junko223@gmail.com</span> จะมีสิทธิ์ผู้ดูแลระบบ (Admin) ในการเข้าถึงเมนูตั้งค่าระบบ
          </p>
        </div>
      </div>
    </div>
  );
};
