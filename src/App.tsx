/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Users, Presentation, Sparkles, HelpCircle, Phone, Monitor } from "lucide-react";
import CbmeHeader from "./components/CbmeHeader";
import AdminPanel from "./components/AdminPanel";
import ParticipantPanel from "./components/ParticipantPanel";
import VisualsPanel from "./components/VisualsPanel";

export default function App() {
  // Dual-role selector mode: 'presenter' (speaker deck), 'participant' (mobile smartphone view) or 'visuals' (full-screen big screen presentation)
  const [role, setRole] = useState<"presenter" | "participant" | "visuals">("participant");
  const [isolatedMode, setIsolatedMode] = useState(false);

  // Check query params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get("role");
    if (roleParam === "participant") {
      setRole("participant");
      setIsolatedMode(true);
    } else if (roleParam === "presenter") {
      setRole("presenter");
      setIsolatedMode(true);
    } else if (roleParam === "visuals") {
      setRole("visuals");
      setIsolatedMode(true);
    } else {
      // Default to participant if no parameter matches
      setRole("participant");
    }
  }, []);

  // Soft state synchronizer
  const handleRoleChange = (newRole: "presenter" | "participant" | "visuals") => {
    setRole(newRole);
    window.history.pushState(null, "", "?role=" + newRole);
  };

  // Keep the title matching user request
  useEffect(() => {
    document.title = "AI輔助互動交流系統 — CBME Taiwan Week";
  }, []);

  // Mount big-screen projection separately (completely optimized fullscreen layout)
  if (role === "visuals") {
    return <VisualsPanel role={role} setRole={handleRoleChange} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 pb-16">
      {/* 2026 CBME Taiwan Week Header */}
      <CbmeHeader />

      {/* 🌟 頂級膠囊分頁切換器 (Pill Switcher like Google AI Studio Chat vs Preview) */}
      <div className="flex justify-center mt-6 -mb-2 z-20 relative">
        <div className="inline-flex p-1 bg-indigo-950 border border-indigo-900 rounded-full shadow-lg items-center">
          <button
            onClick={() => handleRoleChange("participant")}
            className={`px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none ${
              role === "participant"
                ? "bg-indigo-800 text-teal-300 font-extrabold shadow-sm"
                : "text-indigo-200/75 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            學員互動端
          </button>
          
          <button
            onClick={() => handleRoleChange("visuals")}
            className={`px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none ${
              role === "visuals"
                ? "bg-indigo-800 text-teal-300 font-extrabold shadow-sm"
                : "text-indigo-200/75 hover:text-white"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            大螢幕投影
          </button>

          <button
            onClick={() => handleRoleChange("presenter")}
            className={`px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none ${
              role === "presenter"
                ? "bg-indigo-800 text-teal-300 font-extrabold shadow-sm"
                : "text-indigo-200/75 hover:text-white"
            }`}
          >
            <Presentation className="h-3.5 w-3.5" />
            講者控制台
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">

        {/* Dynamic Panel Mounting */}
        <div className="fade-in">
          {role === "presenter" ? (
            <AdminPanel role={role} setRole={handleRoleChange} isolatedMode={isolatedMode} />
          ) : (
            <ParticipantPanel />
          )}
        </div>

      </main>

      {/* Footer info */}
      <footer className="mt-12 text-center text-xs text-slate-400 space-y-3 pb-8">
        <p>© 2026 CBME Taiwan Week • AI Workshop. All rights reserved.</p>
        <p className="mt-1">國泰綜合醫院教學部數位科技暨網路資源中心</p>
      </footer>
    </div>
  );
}
