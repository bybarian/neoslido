import React, { useState, useEffect, useRef } from "react";
import { 
  Brain, Play, Sparkles, Maximize, Minimize, ArrowLeft, Activity, Phone, Monitor, Presentation, Users,
  Lock, Unlock, KeyRound, Eye, EyeOff, ChevronLeft, ChevronRight
} from "lucide-react";
import { 
  collection, query, onSnapshot, doc
} from "firebase/firestore";
import { db } from "../firebase";
import { Question, Answer } from "../types";
import { QRCodeSVG } from "qrcode.react";

export default function VisualsPanel({ 
  role = "visuals", 
  setRole 
}: { 
  role?: "presenter" | "participant" | "visuals"; 
  setRole?: (role: "presenter" | "participant" | "visuals") => void; 
} = {}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answersMap, setAnswersMap] = useState<{ [qId: string]: Answer[] }>({});
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [dbActiveId, setDbActiveId] = useState<string | null>(null);
  const [presentMode, setPresentMode] = useState<"chart" | "wordcloud">("chart");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: "left" | "right") => {
    if (tabsRef.current) {
      const scrollAmount = direction === "left" ? -280 : 280;
      tabsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // Speaker Lock for Big Screen Projection
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const adminUnlocked = localStorage.getItem("cbme_admin_unlocked");
    const visualsUnlocked = localStorage.getItem("cbme_visuals_unlocked");
    if (adminUnlocked === "true" || visualsUnlocked === "true") {
      setIsUnlocked(true);
    }
  }, []);

  const handleUnlock = () => {
    if (passwordInput === "00000") {
      setIsUnlocked(true);
      localStorage.setItem("cbme_visuals_unlocked", "true");
      localStorage.setItem("cbme_admin_unlocked", "true");
      setPasswordInput("");
      setPasswordError("");
    } else {
      setPasswordError("密碼錯誤，請重新輸入大會講者授權密碼");
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    localStorage.removeItem("cbme_visuals_unlocked");
    localStorage.removeItem("cbme_admin_unlocked");
  };

  useEffect(() => {
    setSelectedTerm(null);
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
      setJoinUrl(`${origin}${path}/?role=participant`);
    } else {
      setJoinUrl("https://bybarian.github.io/neoslido/?role=participant");
    }
  }, []);

  // Dynamic header settings from Firestore (to sync banner / meeting meta)
  const [headerTitle, setHeaderTitle] = useState("2026 CBME Taiwan Week × AI Workshop");
  const [headerSubtitle, setHeaderSubtitle] = useState("Leading CBME reform in the AI era • AI輔助互動交流系統");
  const [bannerType, setBannerType] = useState<"default" | "image">("image");
  const [bannerBgUrl, setBannerBgUrl] = useState("");

  const flatColors = [
    "#4f46e5", // Indigo (Main Classy Brand)
    "#0d9488", // Teal
    "#0284c7", // Sky Blue
    "#d97706", // Amber
    "#059669", // Emerald Green
    "#7c3aed", // Violet
    "#db2777", // Pink
    "#4b5563", // Slate Gray
  ];

  // Subscribe to dynamic settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "workshop"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setHeaderTitle(data.title || "2026 CBME Taiwan Week × AI Workshop");
        setHeaderSubtitle(data.subtitle || "Leading CBME reform in the AI era • AI輔助互動交流系統");
        setBannerType(data.bannerType || "image");
        setBannerBgUrl(data.bannerBgUrl || "");
      }
    });
    return () => unsub();
  }, []);

  // Fetch all questions
  useEffect(() => {
    const q = query(collection(db, "questions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const qList: Question[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        qList.push({
          id: docSnap.id,
          title: data.title || "",
          createdAt: data.createdAt,
          isActive: data.isActive || false,
          categories: data.categories || [],
          imageUrl: data.imageUrl || null,
          type: data.type || 'wordcloud',
          options: data.options || []
        });
      });
      // Sort: active questions first
      qList.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      setQuestions(qList);
      
      const currentActive = qList.find(item => item.isActive);
      const activeId = currentActive?.id || qList[0]?.id || null;
      
      setDbActiveId((prev) => {
        if (activeId !== prev) {
          const resolvedActive = qList.find(q => q.id === activeId);
          setActiveQuestion(resolvedActive || null);
          return activeId;
        }
        return prev;
      });
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to answer stream of all loaded questions
  useEffect(() => {
    if (questions.length === 0) return;
    const unsubscribes = questions.map((question) => {
      return onSnapshot(collection(db, `questions/${question.id}/answers`), (snapshot) => {
        const list: Answer[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            text: data.text || "",
            category: data.category || "Other",
            createdAt: data.createdAt,
            userId: data.userId || "anonymous",
            userName: data.userName || "匿名"
          });
        });
        // Sort answers chronology descending
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAnswersMap(prev => ({ ...prev, [question.id]: list }));
      });
    });
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [questions]);

  // Read fullscreen change event
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Fullscreen permission denied:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const focusedQuestion = activeQuestion;
  const focusedAnswers = focusedQuestion ? (answersMap[focusedQuestion.id] || []) : [];
  const totalAnswersCount = focusedAnswers.length;

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-indigo-200/50 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-100 text-indigo-950 flex items-center justify-center shadow-md">
              <Lock className="h-7 w-7 text-indigo-800" />
            </div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">
              大螢幕投影 講者控制權限鎖定
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              大會大螢幕互動投放看板已鎖定為講者/主持人專用權限。請輸入講者授權密碼以開啟大螢幕投影主控。
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUnlock();
                  }
                }}
                placeholder="請輸入大會講者授權密碼"
                className="w-full text-center text-sm rounded-xl border border-slate-300 p-3.5 pr-10 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-slate-800 shadow-inner"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? "隱藏密碼" : "顯示密碼"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {passwordError && (
              <p className="text-xs font-bold text-rose-600 text-center animate-fade-in">
                {passwordError}
              </p>
            )}

            <button
              type="button"
              onClick={handleUnlock}
              className="w-full py-3.5 px-4 bg-indigo-950 hover:bg-indigo-900 text-teal-300 font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-950/20 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound className="h-4 w-4 text-teal-400" />
              驗證講者密碼並開啟大螢幕投影
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200 text-center">
            <button
              type="button"
              onClick={() => {
                if (setRole) setRole("participant");
              }}
              className="text-xs font-bold text-slate-400 hover:text-indigo-700 transition cursor-pointer"
            >
              ← 返回學員互動端
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sortedQuestions = [...questions].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const currentIndex = sortedQuestions.findIndex(q => q.id === focusedQuestion?.id);

  // Compute category statistics
  const categoryStats: { [key: string]: number } = {};
  if (focusedQuestion) {
    focusedQuestion.categories.forEach(cat => {
      categoryStats[cat] = 0;
    });
    categoryStats["Other"] = 0;

    focusedAnswers.forEach(answer => {
      const cat = answer.category;
      if (cat === "Pending") return;
      if (focusedQuestion.categories.includes(cat) || cat === "Other") {
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      } else {
        const match = focusedQuestion.categories.find(c => c.toLowerCase() === cat.toLowerCase());
        if (match) {
          categoryStats[match]++;
        } else {
          categoryStats["Other"]++;
        }
      }
    });
  }

  // Compute poll option statistics if question type is poll
  const pollOptionStats: { [opt: string]: number } = {};
  if (focusedQuestion && focusedQuestion.type === 'poll' && focusedQuestion.options) {
    focusedQuestion.options.forEach(opt => {
      pollOptionStats[opt] = 0;
    });
    focusedAnswers.forEach(ans => {
      if (pollOptionStats[ans.text] !== undefined) {
        pollOptionStats[ans.text]++;
      } else {
        const found = focusedQuestion.options?.find(o => o.trim() === ans.text.trim());
        if (found) {
          pollOptionStats[found]++;
        }
      }
    });
  }

  // Extract medical tags
  const extractWordCloudTerms = (answers: Answer[]) => {
    const wordsMap: { [key: string]: number } = {};
    const stopWords = new Set([
      "的", "了", "在", "是", "我", "你", "他", "與", "及", "或", "和", "這", "那", "有", "也", "就", "都", "", " ",
      "這個", "那個", "一個", "一些", "可以", "我們", "他們", "應該", "如何", "甚麼", "什麼", "覺得", "非常", "需要", "例如",
      "的、", "以及", "目前", "對於", "希望", "進行", "透過", "協助", "提供", "能夠", "針對", "部分", "可能", "已經", "具有",
      "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "for", "with", "on", "at", "by", "from", "as", "is"
    ]);

    answers.forEach(ans => {
      const segments = ans.text.split(/[\s,.\/、，。：；！？?!()（）""''「」『』]+/);
      segments.forEach(seg => {
        const cleanSeg = seg.trim();
        if (!cleanSeg) return;
        if (cleanSeg.length >= 2 && cleanSeg.length <= 15) {
          if (!stopWords.has(cleanSeg.toLowerCase()) && isNaN(Number(cleanSeg))) {
            wordsMap[cleanSeg] = (wordsMap[cleanSeg] || 0) + 1;
          }
        }
      });
    });

    return Object.entries(wordsMap)
      .map(([text, value]) => ({ text, value }))
      .filter(item => item.value >= 1)
      .sort((a, b) => b.value - a.value)
      .slice(0, 36);
  };

  return (
    <div className="min-h-screen bg-slate-55 text-slate-800 flex flex-col justify-between overflow-x-hidden font-sans relative">
      {/* Subtle light ambient glow effects consistent with style instructions */}
      <div className="absolute top-0 right-0 h-96 w-96 bg-indigo-150/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 h-72 w-72 bg-teal-100/30 rounded-full blur-2xl pointer-events-none" />

      {/* HEADER SECTION - Beautiful Indigo and Teal Banner */}
      {bannerType === "image" && bannerBgUrl ? (
        <header className="w-full border-b border-indigo-950 bg-indigo-950 overflow-hidden flex justify-center items-center py-2 md:py-3 px-3 shadow-md z-10 min-h-[70px]">
          <img 
            src={bannerBgUrl} 
            alt="大會專屬客製 Banner" 
            referrerPolicy="no-referrer"
            className="w-full h-auto max-h-[160px] md:max-h-[220px] object-contain mx-auto transition-all"
          />
        </header>
      ) : (
        <header className="bg-indigo-950 text-white px-6 md:px-8 py-4 px-8 flex justify-between items-center shadow-lg border-b border-indigo-900 z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-teal-400 rounded-lg flex items-center justify-center font-black text-indigo-950 text-xl shadow-md shrink-0 animate-pulse">
              AI
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight text-white leading-tight">
                {headerTitle}
              </h1>
              <p className="text-[10px] md:text-xs text-teal-300 font-bold uppercase tracking-widest mt-0.5">
                {headerSubtitle}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right hidden md:block">
              <p className="text-[10px] uppercase tracking-widest opacity-70">當前線上互動人數</p>
              <p className="text-base font-mono font-black text-teal-300 flex items-center gap-1.5 justify-end">
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping inline-block shadow-sm" />
                {totalAnswersCount + 56} <span className="text-[10px] font-normal opacity-80">ONLINE</span>
              </p>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-full border border-white/20">
              <span className="text-xs font-semibold text-teal-200">#CBME2026</span>
            </div>
          </div>
        </header>
      )}

      {/* 🌟 頂級膠囊分頁切換器 (Pill Switcher like Google AI Studio Chat vs Preview) */}
      {setRole && (
        <div className="flex justify-center mt-6 z-20 relative">
          <div className="inline-flex p-1 bg-indigo-950 border border-indigo-900 rounded-full shadow-lg items-center">
            <button
              onClick={() => setRole("participant")}
              className="px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-indigo-200/75 hover:text-white select-none"
            >
              <Users className="h-3.5 w-3.5" />
              學員互動端
            </button>
            
            <button
              onClick={() => setRole("visuals")}
              className="px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer bg-indigo-800 text-teal-300 font-extrabold shadow-sm select-none"
            >
              <Monitor className="h-3.5 w-3.5" />
              大螢幕投影
            </button>

            <button
              onClick={() => setRole("presenter")}
              className="px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-indigo-200/75 hover:text-white select-none"
            >
              <Presentation className="h-3.5 w-3.5" />
              講者控制台
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT WORKSPACE */}
      <main className="flex-1 p-6 md:p-8 xl:p-10 flex flex-col justify-start max-w-7xl mx-auto w-full gap-8 z-10">
        
        {/* 🌟 大螢幕問卷與投票分頁切換器 (Question Tabs & Pagination) */}
        {sortedQuestions.length > 0 && (
          <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
              <span className="flex items-center gap-1.5 text-indigo-900 font-extrabold">
                <Presentation className="h-4 w-4 text-indigo-600" />
                大螢幕互動問卷與投票分頁 (Question Tabs)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                點擊切換當前投放題目 (共 {sortedQuestions.length} 題)
              </span>
            </div>

            <div className="relative flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => scrollTabs("left")}
                className="shrink-0 p-2 rounded-xl bg-slate-100 hover:bg-indigo-900 hover:text-white text-slate-600 transition shadow-xs cursor-pointer z-10 border border-slate-200/90 active:scale-95 select-none"
                title="向左滑動題目列表"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div 
                ref={tabsRef}
                className="flex items-center gap-2 overflow-x-auto pb-1 scroll-smooth scrollbar-none flex-1 py-1"
              >
                {sortedQuestions.map((q, idx) => {
                  const isSelected = q.id === focusedQuestion?.id;
                  const isPoll = q.type === "poll";
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setActiveQuestion(q)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2.5 shrink-0 cursor-pointer select-none border ${
                        isSelected
                          ? "bg-indigo-950 text-white border-indigo-900 shadow-md ring-2 ring-teal-400"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                      }`}
                    >
                      <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-md ${
                        isSelected 
                          ? "bg-teal-400 text-indigo-950 shadow-2xs" 
                          : "bg-slate-200/80 text-slate-600"
                      }`}>
                        Q{idx + 1}
                      </span>

                      <span className="truncate max-w-[160px] md:max-w-[240px]">
                        {q.title}
                      </span>

                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isPoll 
                          ? (isSelected ? "bg-emerald-400 text-emerald-950" : "bg-emerald-100 text-emerald-800 border border-emerald-300")
                          : (isSelected ? "bg-indigo-700 text-indigo-100" : "bg-indigo-100 text-indigo-800 border border-indigo-200")
                      }`}>
                        {isPoll ? "📊 投票" : "☁️ 字雲"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => scrollTabs("right")}
                className="shrink-0 p-2 rounded-xl bg-slate-100 hover:bg-indigo-900 hover:text-white text-slate-600 transition shadow-xs cursor-pointer z-10 border border-slate-200/90 active:scale-95 select-none"
                title="向右滑動題目列表"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {focusedQuestion ? (
          <div className="space-y-8 flex-1 flex flex-col">
            
            {/* Active Question Title Card */}
            <div className="bg-white p-7 md:p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-block px-3 py-1 bg-indigo-100/80 text-indigo-800 text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                    {currentIndex !== -1 ? `第 ${currentIndex + 1} 題 / 共 ${sortedQuestions.length} 題` : "ACTIVE PRESENTATION BOARD"}
                  </span>
                  
                  {sortedQuestions.length > 1 && (
                    <div className="inline-flex gap-1 bg-slate-100 hover:bg-slate-150 p-0.5 rounded-lg border border-slate-200 shadow-2xs items-center">
                      <button
                        onClick={() => {
                          if (currentIndex > 0) {
                            setActiveQuestion(sortedQuestions[currentIndex - 1]);
                          }
                        }}
                        disabled={currentIndex <= 0}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition flex items-center gap-1 select-none ${
                          currentIndex > 0 
                            ? "hover:bg-white text-indigo-900 cursor-pointer" 
                            : "opacity-40 text-slate-400 cursor-not-allowed"
                        }`}
                        title="上一題"
                      >
                        ◀ 上一題
                      </button>
                      <span className="text-[10px] text-slate-350 px-1">|</span>
                      <button
                        onClick={() => {
                          if (currentIndex < sortedQuestions.length - 1) {
                            setActiveQuestion(sortedQuestions[currentIndex + 1]);
                          }
                        }}
                        disabled={currentIndex >= sortedQuestions.length - 1}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition flex items-center gap-1 select-none ${
                          currentIndex < sortedQuestions.length - 1 
                            ? "hover:bg-white text-indigo-900 cursor-pointer" 
                            : "opacity-40 text-slate-400 cursor-not-allowed"
                        }`}
                        title="下一題"
                      >
                        下一題 ▶
                      </button>
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="bg-slate-950 p-1.5 rounded-full border border-slate-800 text-xs flex items-center shadow-lg">
                    <button
                      type="button"
                      onClick={() => setPresentMode("chart")}
                      className={`px-4 py-2 rounded-full font-bold transition cursor-pointer flex items-center gap-1.5 select-none ${
                        presentMode === "chart"
                          ? "bg-slate-800 text-white shadow-md font-extrabold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📊 統計分佈表
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresentMode("wordcloud")}
                      className={`px-4 py-2 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer select-none ${
                        presentMode === "wordcloud"
                          ? "bg-slate-800 text-white shadow-md font-extrabold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ☁️ word cloud
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-1 space-y-4">
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 leading-snug tracking-tight">
                    {focusedQuestion.title}
                  </h2>

                  {focusedQuestion.imageUrl && (
                    <div className="flex justify-start">
                      <div className="max-w-xl w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 relative flex items-center justify-center p-1.5">
                        <img
                          src={focusedQuestion.imageUrl}
                          alt={focusedQuestion.title}
                          className="w-full h-auto max-h-[300px] object-contain rounded-xl transition-all"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center justify-end w-full md:w-auto">
                  {joinUrl && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col items-center justify-center shadow-xs w-[110px] h-[110px] sm:w-[130px] sm:h-[130px] shrink-0">
                      <QRCodeSVG 
                        value={joinUrl} 
                        size={84} 
                        level="Q" 
                        includeMargin={false} 
                      />
                      <span className="text-[9px] font-black text-rose-600 mt-1.5 whitespace-nowrap animate-pulse">📱 掃碼立刻答題</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Split grid for visual layout: charts vs lists */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch flex-1">
              
              {/* LEFT CARD: STATS BOARD or CLOUD */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-400" />
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                  <h3 className="font-extrabold text-slate-700 text-xs uppercase tracking-widest flex items-center gap-1.5">
                    {presentMode === "chart" ? "📈 Real-time AI Categorized Statistics" : "🏷️ AI Semantic Word Cloud Map"}
                  </h3>
                  <span className="text-xs font-mono text-indigo-700 font-extrabold bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100/85">
                    現場合合共 {totalAnswersCount} 筆
                  </span>
                </div>

                {/* CHART or WORDCLOUD ZONE */}
                <div className="my-4 flex-1 flex flex-col justify-center min-h-[340px] md:min-h-[400px]">
                  {presentMode === "chart" ? (
                    <div className="space-y-5.5 py-2 w-full">
                      {focusedQuestion.type === 'poll' ? (
                        Object.entries(pollOptionStats).map(([opt, count], idx) => {
                          const percentage = totalAnswersCount > 0 ? Math.round((count / totalAnswersCount) * 100) : 0;
                          const barColor = flatColors[idx % flatColors.length];

                          return (
                            <div key={opt} className="space-y-2">
                              <div className="flex items-center justify-between text-xs md:text-sm font-extrabold">
                                <span className="text-slate-800 flex items-center gap-2">
                                  <span className="inline-block h-3.5 w-3.5 rounded-md" style={{ backgroundColor: barColor }} />
                                  <span>{opt}</span>
                                </span>
                                <span className="text-slate-600 font-mono text-[11px] md:text-xs">
                                  {count} 票 ({percentage}%)
                                </span>
                              </div>
                              <div className="h-5 w-full bg-slate-100 rounded-lg overflow-hidden relative border border-slate-200/60">
                                <div 
                                  className="h-full rounded-lg transition-all duration-1000 ease-out" 
                                  style={{ 
                                    width: `${totalAnswersCount > 0 ? (count / totalAnswersCount) * 100 : 0}%`,
                                    backgroundColor: barColor
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        Object.entries(categoryStats).map(([category, count], idx) => {
                          const percentage = totalAnswersCount > 0 ? Math.round((count / totalAnswersCount) * 100) : 0;
                          const barColor = flatColors[idx % flatColors.length];

                          if (category === "Other" && count === 0) return null;
                          if (category === "Pending") return null;

                          return (
                            <div key={category} className="space-y-2">
                              <div className="flex items-center justify-between text-xs md:text-sm font-extrabold">
                                <span className="text-slate-700 flex items-center gap-2">
                                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: barColor }} />
                                  {category === "Other" ? "其他 / 綜合回饋" : category}
                                </span>
                                <span className="text-slate-500 font-mono text-[11px] md:text-xs">
                                  {count} 筆想法 ({percentage}%)
                                </span>
                              </div>
                              <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden relative">
                                <div 
                                  className="h-full rounded-full transition-all duration-1000 ease-out" 
                                  style={{ 
                                    width: `${totalAnswersCount > 0 ? (count / totalAnswersCount) * 100 : 0}%`,
                                    backgroundColor: barColor
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col justify-center items-center py-4">
                      {totalAnswersCount > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-x-4.5 gap-y-3.5 max-w-3xl mx-auto">
                          {(() => {
                            const cloudTerms = extractWordCloudTerms(focusedAnswers);
                            if (cloudTerms.length === 0) {
                              return (
                                <p className="text-xs text-slate-400 italic">智慧分詞熱加載中...</p>
                              );
                            }
                            const maxVal = Math.max(...cloudTerms.map(t => t.value));
                            const minVal = Math.min(...cloudTerms.map(t => t.value));

                            const fontSizes = [13, 16, 20, 24, 30, 38, 44, 50];
                            const rotations = ["rotate-0", "rotate-0", "-rotate-1", "rotate-1", "rotate-0"];

                            return cloudTerms.map((term, index) => {
                              const scale = maxVal === minVal ? 0.3 : (term.value - minVal) / (maxVal - minVal);
                              const sizeIdx = Math.min(Math.floor(scale * (fontSizes.length - 1)), fontSizes.length - 1);
                              const fontSize = fontSizes[sizeIdx];
                              const rot = rotations[index % rotations.length];
                              const color = flatColors[index % flatColors.length];
                              const isSelected = selectedTerm === term.text;
                              const isDimmed = selectedTerm && selectedTerm !== term.text;

                              return (
                                <span
                                  key={term.text}
                                  onClick={() => setSelectedTerm(isSelected ? null : term.text)}
                                  style={{ 
                                    fontSize: `${fontSize}px`, 
                                    color: isSelected ? "#ffffff" : color 
                                  }}
                                  className={`inline-flex items-center font-black transition-all duration-150 cursor-pointer m-1.5 select-none ${rot} ${
                                    isSelected 
                                      ? "bg-slate-900 text-white px-4 py-1.5 rounded-full scale-110 shadow-lg border-2 border-teal-400" 
                                      : isDimmed 
                                        ? "opacity-25 scale-90" 
                                        : "hover:scale-105"
                                  }`}
                                  title={`語意次數: ${term.value}次 (點選看分類想法)`}
                                >
                                  {term.text}
                                  <span className={`text-[9px] font-mono ml-0.5 font-normal ${isSelected ? "text-teal-300 font-extrabold" : "opacity-40"}`}>
                                    ({term.value})
                                  </span>
                                </span>
                              );
                            });
                          })()}
                        </div>
                      ) : (
                        <div className="text-center text-slate-400 space-y-2">
                          <Activity className="h-9 w-9 text-slate-300 animate-pulse mx-auto" />
                          <p className="text-xs font-bold">目前尚未有想法可解析為 Word Cloud</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 p-4 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4.5 w-4.5 text-teal-700 shrink-0 animate-bounce" />
                    <p className="text-[11px] text-teal-900 font-semibold leading-normal">
                      「大會即時 AI 智慧看版：臨床醫教想法送出即刻熱重載、一鍵 AI 智慧分類，實現完美雙向互動」
                    </p>
                  </div>
                </div>

              </div>

              {/* RIGHT CARD: FEED STREAM LIST */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col justify-between overflow-hidden min-h-[385px]">
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                  <h3 className="font-extrabold text-slate-800 text-xs tracking-wider flex items-center gap-1.5 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                    </span>
                    {selectedTerm ? (
                      <span className="text-indigo-900 font-extrabold bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-md flex items-center gap-1 text-[10px] truncate">
                        🔍 篩選: 「{selectedTerm}」
                      </span>
                    ) : (
                      <span className="truncate">現場串流</span>
                    )}
                  </h3>
                  
                  {selectedTerm ? (
                    <button
                      onClick={() => setSelectedTerm(null)}
                      className="text-[10px] bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-black px-2.5 py-1 rounded-full cursor-pointer select-none transition shrink-0"
                    >
                      ✕ 清除篩選
                    </button>
                  ) : (
                    <span className="text-[9px] bg-indigo-100 border border-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider shrink-0 select-none">
                      SEC-SYNC
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 max-h-[500px]">
                  {(() => {
                    const filteredAnswers = selectedTerm 
                      ? focusedAnswers.filter(ans => ans.text.toLowerCase().includes(selectedTerm.toLowerCase()))
                      : focusedAnswers;

                    return filteredAnswers.length > 0 ? (
                      filteredAnswers.map((answer) => {
                        const isPending = answer.category === "Pending";
                        const categoryIndex = focusedQuestion.categories.indexOf(answer.category);
                        const badgeColor = isPending ? "#475569" : (categoryIndex >= 0 ? flatColors[categoryIndex % flatColors.length] : "#3b82f6");

                        return (
                          <div 
                            key={answer.id} 
                            className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100/60 border border-slate-150 transition duration-150 flex flex-col gap-2.5 text-xs animate-fade-in shadow-2xs"
                          >
                            <p className="text-slate-850 font-semibold leading-relaxed italic">
                              "{answer.text}"
                            </p>
                            
                            <div className="flex items-center justify-between gap-4 mt-1 border-t border-slate-200/50 pt-2 flex-wrap">
                              <span className="text-[9px] text-slate-400 font-semibold">
                                # 匿名參與者 • {answer.createdAt ? new Date(answer.createdAt.seconds * 1000).toLocaleTimeString("zh-TW") : "剛送出"}
                              </span>
                              
                              <span 
                                className="px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-wider" 
                                style={{ backgroundColor: badgeColor }}
                              >
                                {answer.category === "Pending" ? "⏳ 待 AI 歸類" : (answer.category === "Other" ? "綜合領域" : answer.category)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 space-y-2">
                        <Activity className="h-6 w-6 text-slate-300 animate-pulse" />
                        <p className="font-bold text-xs">
                          {selectedTerm ? `沒有找到包含「${selectedTerm}」的想法` : "等待想法投入中..."}
                        </p>
                      </div>
                    );
                  })()}
                </div>

              </div>

            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center py-28 text-center bg-white rounded-2xl border border-dashed border-slate-250 p-12 shadow-inner">
            <h3 className="font-extrabold text-slate-450 text-base">臨床大會工作坊尚未建立或投放任何問題</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">請講者在主控台點選互動題目投放至本投影螢幕中！</p>
          </div>
        )}

      </main>

      {/* FLOATING ACTION UTILITY TRIGGERS */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={handleLock}
          className="bg-indigo-950/95 hover:bg-rose-950 border border-indigo-800/80 px-3.5 py-2.5 rounded-xl text-xs font-black text-emerald-400 hover:text-rose-300 shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 h-10 cursor-pointer select-none"
          title="點擊重新鎖定大螢幕講者控制權限"
        >
          <Unlock className="h-4 w-4 text-emerald-400" />
          <span>講者已解鎖 (鎖定)</span>
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="bg-indigo-950/95 hover:bg-indigo-900 border border-indigo-800/80 p-2 rounded-xl text-slate-200 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center h-10 w-10"
          title="切換瀏覽器全螢幕投放"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5 text-teal-300" />
          ) : (
            <Maximize className="h-4.5 w-4.5 text-teal-300" />
          )}
        </button>

        {setRole ? (
          <button 
            type="button"
            onClick={() => setRole("presenter")}
            className="bg-indigo-950/95 hover:bg-indigo-900 border border-indigo-800/80 px-4 py-2.5 rounded-xl text-xs font-black text-slate-200 hover:text-white shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 h-10 cursor-pointer select-none"
            title="退出大螢幕投影模式回到主控分頁"
          >
            <ArrowLeft className="h-4 w-4" />
            主控台
          </button>
        ) : (
          <a 
            href="?role=presenter"
            className="bg-indigo-950/95 hover:bg-indigo-900 border border-indigo-800/80 px-4 py-2.5 rounded-xl text-xs font-black text-slate-200 hover:text-white shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 h-10"
            title="退出大螢幕投影模式回到主控分頁"
          >
            <ArrowLeft className="h-4 w-4" />
            主控台
          </a>
        )}
      </div>

      {/* FOOTER SECTION: QR CODE & PRESENTER ACCESS */}
      <footer className="bg-white border-t border-slate-240 py-3.5 px-6 md:px-8 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 text-slate-500 font-medium min-h-[96px]">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          {joinUrl ? (
            <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm inline-flex items-center justify-center shrink-0">
              <QRCodeSVG 
                value={joinUrl} 
                size={68} 
                level="Q" 
                includeMargin={false} 
              />
            </div>
          ) : (
            <div className="bg-slate-900 text-teal-400 font-mono font-bold px-3 py-1.5 rounded text-xs select-none shadow-sm">
              QR CODE
            </div>
          )}
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">大會現場與會學員手機掃描，免登入立刻加入互動答題</p>
            <p className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5 mt-0.5">
              <span>📱 掃描上方二維條碼快速進入「學員互動端」</span>
            </p>
            {joinUrl && (
              <span className="text-[10px] text-slate-400 font-mono block mt-1 break-all select-all">
                {joinUrl}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1 text-xs text-slate-400 font-bold font-mono">
          <span>CBME Taiwan Week • AI Projection Board v3</span>
          <span className="text-[9px] text-emerald-600 font-extrabold">● 即時同步中</span>
        </div>
      </footer>
    </div>
  );
}
