import React, { useState, useEffect } from "react";
import { 
  Send, Sparkles, CheckCircle2, MessageSquare, AlertCircle, 
  RefreshCw, Layers, Vote, BarChart, History, ArrowRight, Trash2
} from "lucide-react";
import { 
  collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Question, Answer } from "../types";

export default function ParticipantPanel() {
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [inputText, setInputText] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [successAnswer, setSuccessAnswer] = useState<{ text: string; category: string } | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  // Generate or retrieve persistent local user ID for answering tracking
  useEffect(() => {
    let storedId = localStorage.getItem("cbme_participant_uid");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      localStorage.setItem("cbme_participant_uid", storedId);
    }
    setUserId(storedId);
  }, []);

  // Listen to the active question (real-time presenter sync)
  useEffect(() => {
    const q = query(collection(db, "questions"), where("isActive", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        const data = firstDoc.data();
        setActiveQuestion({
          id: firstDoc.id,
          title: data.title || "",
          createdAt: data.createdAt,
          isActive: data.isActive || false,
          categories: data.categories || [],
          imageUrl: data.imageUrl || null
        });
        // Clear success modal when question shifts
        setSuccessAnswer(null);
        setErrorText(null);
      } else {
        setActiveQuestion(null);
      }
    }, (error) => {
      console.error("Error fetching active question:", error);
    });
    return () => unsubscribe();
  }, []);

  // Fetch all compiled answers for the active question for instant visual stats
  useEffect(() => {
    if (!activeQuestion) {
      setAnswers([]);
      return;
    }
    const path = `questions/${activeQuestion.id}/answers`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const qAnswers: Answer[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        qAnswers.push({
          id: docSnap.id,
          text: data.text || "",
          category: data.category || "Other",
          createdAt: data.createdAt,
          userId: data.userId || ""
        });
      });
      setAnswers(qAnswers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [activeQuestion]);

  // Handle Form Submission - Instant Write (一鍵待講師歸納模式)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuestion) return;
    
    const textToSubmit = inputText.trim();
    if (!textToSubmit) {
      setErrorText("請輸入一些回覆內容！");
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      // Perform direct, secure Firestore write with a category of "Pending"
      const answerId = "ans_" + Date.now() + "_" + Math.floor(Math.random() * 100);
      const answerDocRef = doc(db, `questions/${activeQuestion.id}/answers`, answerId);
      
      await setDoc(answerDocRef, {
        text: textToSubmit,
        category: "Pending",
        createdAt: serverTimestamp(),
        userId: userId
      });

      // Clear input & show instant animation of successful submission
      setInputText("");
      setSuccessAnswer({
        text: textToSubmit,
        category: "Pending"
      });
    } catch (error) {
      console.error("Submission failed:", error);
      setErrorText(error instanceof Error ? error.message : "連線發生錯誤，請確認網路連線。");
    } finally {
      setLoading(false);
    }
  };

  // Allow participant to withdraw/delete their own submitted idea
  const handleDeleteMyAnswer = (answerId: string) => {
    if (!activeQuestion) return;
    requestConfirm(
      "收回想法確認",
      "確定要收回/刪除這筆想法嗎？此動作無法復原。",
      async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, `questions/${activeQuestion.id}/answers`, answerId));
        } catch (error) {
          console.error("Failed to delete submission:", error);
          setErrorText("刪除失敗，請再試一次。");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Calculate my submitted answers size
  const mySubmissions = answers.filter(a => a.userId === userId);

  // Statistics
  const catStats: { [key: string]: number } = {};
  if (activeQuestion) {
    activeQuestion.categories.forEach(c => {
      catStats[c] = 0;
    });
    catStats["Other"] = 0;
    answers.forEach(a => {
      if (catStats[a.category] !== undefined) {
        catStats[a.category]++;
      } else {
        catStats["Other"]++;
      }
    });
  }

  const flatColors = ["#0e7490", "#b91c1c", "#0369a1", "#f59e0b", "#4d7c0f", "#6d28d9", "#be185d", "#57534e"];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      
      {/* Custom Confirmation Dialog Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl animate-scale-up">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              ⚠️ {confirmDialog.title}
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-slate-500 font-medium">
              {confirmDialog.message}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
              >
                確認進行
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ACTIVE QUESTION PANEL */}
      {activeQuestion ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          
          {/* Header Tag - Styled as Indigo Sleek Theme */}
          <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-850 px-5 py-4 text-white flex items-center justify-between border-b border-indigo-900/50">
            <span className="text-[10px] uppercase font-extrabold tracking-widest flex items-center gap-1.5 text-teal-300">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse inline-block shadow-lg shadow-teal-400" />
              大會即時同步中 (Presenter Active)
            </span>
            <span className="text-xs font-mono font-bold bg-white/10 px-3 py-1 rounded-full border border-white/20 select-none text-teal-200">
              #CBME2026
            </span>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Title with live category action tag and image side-by-side on wider space */}
            <div className="space-y-3">
              <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                Q1 LIVE INTERACTIVE QUESTION
              </span>
              
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-800 leading-snug">
                    {activeQuestion.title}
                  </h2>
                </div>

                {activeQuestion.imageUrl && (
                  <div className="flex justify-center">
                    <div className="max-w-md w-full rounded-xl overflow-hidden border border-slate-150 shadow-xs bg-slate-50 relative flex items-center justify-center p-1">
                      <img
                        src={activeQuestion.imageUrl}
                        alt={activeQuestion.title}
                        className="w-full h-auto max-h-[220px] object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SUCCESS STATE BLOCK */}
            {successAnswer && (
              <div className="p-5 bg-teal-50/70 rounded-2xl border border-teal-200 space-y-3.5 fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 animate-bounce" />
                  <span className="font-extrabold text-teal-900 text-xs tracking-wide">大會醫療想法提交成功！</span>
                </div>
                <div className="text-xs text-slate-700 space-y-2 pl-7 font-sans">
                  <p className="italic font-medium text-slate-800 bg-white/80 p-3 rounded-lg border border-teal-100">"{successAnswer.text}"</p>
                  <p className="text-slate-500 leading-normal">
                    ✨ 您的反思已成功投影至大螢幕！講師與主持人稍後將一鍵啟動 Gemini AI 智慧分類，讓想法同步對齊大會核心指標。
                  </p>
                </div>
                <div className="pl-7 pt-1">
                  <button 
                    onClick={() => setSuccessAnswer(null)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    再提供另一個關鍵點子 <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* ERROR STATE */}
            {errorText && (
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-700 font-medium text-xs flex items-center gap-2">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            {/* INPUT FORM WITH ULTRA PROMINENT SUBMIT BUTTON */}
            {!successAnswer && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700 flex justify-between">
                    <span>輸入您的反思、評論或臨床實務經驗：</span>
                    <span className="text-[10px] text-slate-400 font-normal">限 500 字</span>
                  </label>
                  <textarea
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value.substring(0, 500));
                      if (errorText) setErrorText(null);
                    }}
                    placeholder="請分享您的想法，例如：臨床回饋最困難的是缺乏客觀評估，建議導入多元客觀評量流程..."
                    className="w-full text-xs rounded-xl border border-slate-200 p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/70 hover:bg-slate-50 transition min-h-[105px] text-slate-800 placeholder:text-slate-400 shadow-inner"
                    rows={4}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium max-w-[200px] leading-normal">
                    * 本活動採完全匿名制，所有文字即時在前方投影呈現，僅統計歸納佔比。
                  </span>
                  
                  <button
                    type="submit"
                    disabled={loading || !inputText.trim()}
                    className="w-full sm:w-auto flex justify-center items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white transition-all duration-200 py-3.5 px-8 text-sm font-black shadow-lg shadow-indigo-100 hover:shadow-indigo-200 hover:shadow-xl active:scale-95 transform shrink-0 cursor-pointer select-none"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        提交並投影中...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 text-teal-300" />
                        🚀 立即送出 Idea (即時投影)
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* PERSISTENT SUBMISSION HISTORY FOR CURRENT USER */}
            {mySubmissions.length > 0 && (
              <div className="pt-5 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-slate-500" />
                  我提交的想法記錄 ({mySubmissions.length})
                </h3>

                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {mySubmissions.map((sub) => {
                    const isPending = sub.category === "Pending";
                    const idx = activeQuestion.categories.indexOf(sub.category);
                    const color = isPending ? "#64748b" : (idx >= 0 ? flatColors[idx % flatColors.length] : "#57534e");

                    return (
                      <div key={sub.id} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-150 flex items-start gap-3 text-[11px] justify-between">
                        <div className="flex-1">
                          <p className="text-slate-705 leading-relaxed italic">
                            "{sub.text}"
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span 
                            className="text-[8px] font-bold text-white uppercase px-1.5 py-0.5 rounded-xs" 
                            style={{ backgroundColor: color }}
                          >
                            {sub.category === "Pending" ? "待一鍵分析" : (sub.category === "Other" ? "其他反思" : sub.category)}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteMyAnswer(sub.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title="收回/刪除此想法"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIVE ANSWER STATS TAB PREVIEW (FOR CELLPHONES) */}
            {answers.length > 0 && (
              <div className="pt-5 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <BarChart className="h-3.5 w-3.5 text-slate-500" />
                  目前大會統計概況 (Workshop Distribution Preview)
                </h3>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {Object.entries(catStats).map(([cat, val], idx) => {
                    if (cat === "Other" && val === 0) return null;
                    if (cat === "Pending") return null; // We display Pending separately or as text
                    const percent = answers.length > 0 ? Math.round((val / answers.length) * 100) : 0;
                    const color = flatColors[idx % flatColors.length];

                    return (
                      <div key={cat} className="p-2 bg-slate-50 rounded border border-slate-100 flex justify-between items-center">
                        <span className="truncate max-w-[100px] text-slate-600 font-medium flex items-center gap-1">
                          <span className="inline-block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color }} />
                          {cat}
                        </span>
                        <span className="font-bold text-slate-900 font-mono">
                          {percent}%
                        </span>
                      </div>
                    );
                  })}
                  {answers.some(a => a.category === "Pending") && (
                    <div className="p-2 bg-slate-100/70 rounded border border-slate-200 flex justify-between items-center col-span-2 text-[9px] text-slate-500">
                      <span>⏳ 待一鍵分析的學員草稿：</span>
                      <span className="font-bold font-mono">
                        {answers.filter(a => a.category === "Pending").length} 份意見
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-slate-700 text-base">
              等待演講者/主持人 開啟活動題目...
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
              目前大會主視覺尚未投放任何互動交流問題。一旦主持人點選投影，您的畫面將秒級即時同步載入！請保持本網頁開啟。
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
