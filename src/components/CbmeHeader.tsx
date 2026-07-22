import React, { useState, useEffect } from "react";
import { Heart, Stethoscope, Sparkles } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { WorkshopSettings } from "../types";

const defaultSettings: WorkshopSettings = {
  title: "2026 CBME Taiwan Week × AI Workshop",
  subtitle: "Leading CBME reform in the AI era • AI輔助互動交流系統",
  sponsor1Name: "國泰綜合醫院",
  sponsor1Sub: "Cathay General Hospital",
  sponsor2Name: "中國醫藥大學附設醫院",
  sponsor2Sub: "China Medical University Hospital",
  bannerType: 'image',
  bannerBgUrl: ''
};

export default function CbmeHeader() {
  const [settings, setSettings] = useState<WorkshopSettings>(defaultSettings);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "workshop"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          title: data.title || defaultSettings.title,
          subtitle: data.subtitle || defaultSettings.subtitle,
          sponsor1Name: data.sponsor1Name !== undefined ? data.sponsor1Name : defaultSettings.sponsor1Name,
          sponsor1Sub: data.sponsor1Sub !== undefined ? data.sponsor1Sub : defaultSettings.sponsor1Sub,
          sponsor2Name: data.sponsor2Name !== undefined ? data.sponsor2Name : defaultSettings.sponsor2Name,
          sponsor2Sub: data.sponsor2Sub !== undefined ? data.sponsor2Sub : defaultSettings.sponsor2Sub,
          bannerType: data.bannerType || 'image',
          bannerBgUrl: data.bannerBgUrl || ''
        });
      }
    }, (err) => {
      console.warn("Failed to subscribe to settings:", err);
    });
    return () => unsub();
  }, []);

  if (settings.bannerType === 'image') {
    if (settings.bannerBgUrl) {
      return (
        <header className="relative w-full border-b border-indigo-900 bg-indigo-950 overflow-hidden flex justify-center items-center py-2 md:py-3 px-3">
          <img 
            src={settings.bannerBgUrl} 
            alt="Workshop Custom Banner" 
            referrerPolicy="no-referrer"
            className="w-full h-auto max-h-[160px] md:max-h-[220px] object-contain mx-auto animate-fade-in"
          />
        </header>
      );
    } else {
      return (
        <header className="relative w-full border-b border-indigo-950 bg-indigo-950 py-10 flex flex-col justify-center items-center text-center px-4">
          <div className="max-w-4xl w-full border border-dashed border-teal-500/30 bg-indigo-900/40 rounded-2xl p-7 hover:bg-indigo-900/60 transition-colors duration-300">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-teal-300 bg-teal-500/10 border border-teal-500/20 mb-3 uppercase tracking-wider">
              📸 自訂學術大會 Banner 橫幅
            </span>
            <p className="text-xs text-indigo-200 max-w-xl mx-auto leading-relaxed">
              點擊講者控制台中的「<span className="font-bold text-white">修改大會看版與客製 Banner 上傳</span>」即可一鍵置換大會客製橫幅！
            </p>
          </div>
        </header>
      );
    }
  }

  return (
    <header className="relative overflow-hidden bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white border-b border-indigo-800 shadow-md">
      {/* Sleek theme background light effects */}
      <div className="absolute top-0 right-0 h-44 w-44 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* CBME & AI Badge block */}
          <div className="flex items-center gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-400 text-indigo-950 font-black text-2xl shadow-lg shadow-teal-400/20">
              AI
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-indigo-500 border-2 border-teal-400/20 animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-black tracking-tight text-white leading-normal">
                  {settings.title}
                </span>
              </div>
              <p className="text-xs font-bold text-teal-300 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-teal-300 animate-pulse" />
                {settings.subtitle}
              </p>
            </div>
          </div>

          {/* Sponsoring Institutions info inside themed sleek containers */}
          <div className="flex flex-wrap items-center gap-4 justify-center md:justify-end text-[11px] text-slate-200">
            {settings.sponsor1Name && (
              <div className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 transition px-3 py-1.5 rounded-lg border border-white/10 shadow-xs">
                <Heart className="h-3.5 w-3.5 text-teal-300 fill-teal-400/10" />
                <div>
                  <p className="font-bold text-teal-50 text-xs">{settings.sponsor1Name}</p>
                  <p className="text-[9px] text-teal-300/60 font-mono">{settings.sponsor1Sub}</p>
                </div>
              </div>
            )}
            {settings.sponsor2Name && (
              <div className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 transition px-3 py-1.5 rounded-lg border border-white/10 shadow-xs">
                <Stethoscope className="h-3.5 w-3.5 text-teal-300" />
                <div>
                  <p className="font-bold text-teal-50 text-xs">{settings.sponsor2Name}</p>
                  <p className="text-[9px] text-teal-300/60 font-mono">{settings.sponsor2Sub}</p>
                </div>
              </div>
            )}
            
            <div className="bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="font-mono text-[10px] font-extrabold tracking-wider text-teal-300 mr-0.5">#CBME2026</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
