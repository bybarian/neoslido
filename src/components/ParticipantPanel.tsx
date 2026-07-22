import React, { useState, useEffect } from "react";
import { 
  Send, CheckCircle2, AlertCircle, 
  RefreshCw, Vote, BarChart, History, ArrowRight, Trash2, Lock, Unlock, Sparkles, MessageSquare, User, Briefcase, Building2, Heart, List, Cloud
} from "lucide-react";
import { 
  collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, deleteDoc, updateDoc, increment
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Question, Answer } from "../types";

export default function ParticipantPanel() {
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem("cbme_participant_name") || "";
  });
  const [userTitle, setUserTitle] = useState(() => {
    return localStorage.getItem("cbme_participant_title") || "";
  });
  const [userHospital, setUserHospital] = useState(() => {
    return localStorage.getItem("cbme_participant_hospital") || "";
  });
  const [loading, setLoading] = useState(false);

  const handleUserNameChange = (val: string) => {
    setUserName(val);
    localStorage.setItem("cbme_participant_name", val);
  };
  const handleUserTitleChange = (val: string) => {
    setUserTitle(val);
    localStorage.setItem("cbme_participant_title", val);
  };
  const handleUserHospitalChange = (val: string) => {
    setUserHospital(val);
    localStorage.setItem("cbme_participant_hospital", val);
  };
  const [successAnswer, setSuccessAnswer] = useState<{ text: string; category: string } | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  
  // View mode: 'answering' (locked focus page) vs 'presentation' (unlocked results page)
  const [viewMode, setViewMode] = useState<"answering" | "presentation">("answering");
  const [hasSubmittedCurrent, setHasSubmittedCurrent] = useState(false);

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
        const loadedQuestion: Question = {
          id: firstDoc.id,
          title: data.title || "",
          createdAt: data.createdAt,
          isActive: data.isActive || false,
          categories: data.categories || [],
          imageUrl: data.imageUrl || null,
          type: data.type || 'wordcloud',
          displayMode: data.displayMode || 'list',
          options: data.options || []
        };
        
        setActiveQuestion(loadedQuestion);
        setSuccessAnswer(null);
        setErrorText(null);
        setInputText("");
        setSelectedOption("");
      } else {
        setActiveQuestion(null);
      }
    }, (error) => {
      console.error("Error fetching active question:", error);
    });
    return () => unsubscribe();
  }, []);

  // Handle Like Answer
  const handleLikeAnswer = async (questionId: string, answerId: string) => {
    try {
      const key = `cbme_liked_${answerId}`;
      const isLiked = localStorage.getItem(key) === "true";
      const answerRef = doc(db, `questions/${questionId}/answers`, answerId);

      if (isLiked) {
        localStorage.removeItem(key);
        await updateDoc(answerRef, { likes: increment(-1) });
      } else {
        localStorage.setItem(key, "true");
        await updateDoc(answerRef, { likes: increment(1) });
      }
    } catch (err) {
      console.error("Failed to update like:", err);
    }
  };

  // Fetch all compiled answers for the active question for instant visual stats
  useEffect(() => {
    if (!activeQuestion) {
      setAnswers([]);
      setHasSubmittedCurrent(false);
      return;
    }
    const path = `questions/${activeQuestion.id}/answers`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const qAnswers: Answer[] = [];
      let submittedByMe = false;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const uId = data.userId || "";
        if (uId === userId) {
          submittedByMe = true;
        }
        qAnswers.push({
          id: docSnap.id,
          text: data.text || "",
          category: data.category || "Other",
          createdAt: data.createdAt,
          userId: uId,
          userName: data.userName || "匿名",
          userTitle: data.userTitle || "",
          userHospital: data.userHospital || "",
          likes: data.likes || 0,
          likedBy: data.likedBy || []
        });
      });
      setAnswers(qAnswers);
      setHasSubmittedCurrent(submittedByMe);

      // Auto-unlock to presentation page if participant already submitted an answer for current active question
      if (submittedByMe) {
        setViewMode("presentation");
      } else {
        setViewMode("answering");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [activeQuestion, userId]);

  // Handle Submission - Instant Write
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuestion) return;
    
    let textToSubmit = "";
    if (activeQuestion.type === "poll") {
      textToSubmit = selectedOption.trim();
      if (!textToSubmit) {
        setErrorText("請點選一個投票選項！");
        return;
      }
    } else {
      textToSubmit = inputText.trim();
      if (!textToSubmit) {
        setErrorText("請輸入一些回覆內容！");
        return;
      }
    }

    // Prevent duplicate submission
    if (hasSubmittedCurrent || mySubmissions.length > 0) {
      setErrorText("您先前已完成本題作答/投票，每題僅限投出一次，無法重複送出。");
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      const answerId = "ans_" + Date.now() + "_" + Math.floor(Math.random() * 100);
      const answerDocRef = doc(db, `questions/${activeQuestion.id}/answers`, answerId);
      
      await setDoc(answerDocRef, {
        text: textToSubmit,
        category: activeQuestion.type === "poll" ? "Vote" : "Pending",
        createdAt: serverTimestamp(),
        userId: userId,
        userName: userName.trim() || "匿名",
        userTitle: userTitle.trim() || "",
        userHospital: userHospital.trim() || ""
      });

      // Clear input & transition to presentation view
      setInputText("");
      setSelectedOption("");
      setSuccessAnswer({
        text: textToSubmit,
        category: activeQuestion.type === "poll" ? "Vote" : "Pending"
      });
      setViewMode("presentation");
    } catch (error) {
      console.error("Submission failed:", error);
      setErrorText(error instanceof Error ? error.message : "連線發生錯誤，請確認網路連線。");
    } finally {
      setLoading(false);
    }
  };

  // Allow participant to withdraw/delete their own submitted response
  const handleDeleteMyAnswer = (answerId: string) => {
    if (!activeQuestion) return;
    requestConfirm(
      "收回紀錄確認",
      "確定要收回/刪除這筆回答嗎？收回後將解除鎖定，您可以重新作答。",
      async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, `questions/${activeQuestion.id}/answers`, answerId));
          setViewMode("answering");
        } catch (error) {
          console.error("Failed to delete submission:", error);
          setErrorText("刪除失敗，請再試一次。");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const mySubmissions = answers.filter(a => a.userId === userId);

  // Statistics Calculation
  const catStats: { [key: string]: number } = {};
  const pollStats: { [key: string]: number } = {};

  if (activeQuestion) {
    if (activeQuestion.type === 'poll') {
      (activeQuestion.options || []).forEach(opt => {
        pollStats[opt] = 0;
      });
      answers.forEach(a => {
        if (pollStats[a.text] !== undefined) {
          pollStats[a.text]++;
        }
      });
    } else {
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
          <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-850 px-5 py-3.5 text-white flex items-center justify-between border-b border-indigo-900/50">
            <span className="text-[10px] uppercase font-extrabold tracking-widest flex items-center gap-1.5 text-teal-300">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse inline-block shadow-lg shadow-teal-400" />
              大會即時同步中 (Presenter Active)
            </span>

            {/* Mode Switcher Pills */}
            <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-full border border-white/20">
              <button
                type="button"
                onClick={() => setViewMode("answering")}
                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 select-none ${
                  viewMode === "answering" 
                    ? "bg-teal-400 text-indigo-950 shadow-xs" 
                    : "text-indigo-200 hover:text-white"
                }`}
              >
                <Lock className="h-3 w-3" />
                作答頁
              </button>
              <button
                type="button"
                onClick={() => setViewMode("presentation")}
                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 select-none ${
                  viewMode === "presentation" 
                    ? "bg-teal-400 text-indigo-950 shadow-xs" 
                    : "text-indigo-200 hover:text-white"
                }`}
              >
                <Unlock className="h-3 w-3" />
                大會動態
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Question Title & Mode Header */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                  {activeQuestion.type === 'poll' ? '📊 多元投票模式 (POLL)' : '☁️ 智慧字雲與思考 (WORD CLOUD)'}
                </span>
                
                {hasSubmittedCurrent && (
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    已完成回答
                  </span>
                )}
              </div>
              
              <div className="space-y-4">
                <h2 className="text-lg md:text-xl font-bold text-slate-800 leading-snug">
                  {activeQuestion.title}
                </h2>

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

            {/* 1. ANSWERING MODE (LOCKED VIEW BEFORE SUBMISSION) */}
            {viewMode === "answering" && (
              <div className="space-y-5 fade-in">
                
                {hasSubmittedCurrent ? (
                  /* ALREADY SUBMITTED CARD - STRICT SINGLE SUBMISSION */
                  <div className="p-6 bg-slate-50/90 rounded-2xl border border-slate-200 text-center space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-xs">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-extrabold text-slate-800 text-sm">
                        您已完成本題的{activeQuestion.type === 'poll' ? '投票' : '回答'}！
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        為維持大會數據公平性與即時真實性，每位學員每題僅限投一次票/作答，系統無法重複送出或更換選項。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMode("presentation")}
                      className="px-5 py-2.5 rounded-xl bg-indigo-900 hover:bg-indigo-800 text-teal-300 font-extrabold text-xs transition cursor-pointer shadow-sm inline-flex items-center gap-1.5 mt-2"
                    >
                      <Unlock className="h-4 w-4" />
                      前往查看大會即時動態與統計看板
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Lock Status Banner */}
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs font-bold flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        專注答題頁：完成下方作答/投票並送出後，系統將即時投射至大螢幕並解鎖全場動態 (每人限投 1 次)！
                      </span>
                    </div>

                    {/* Participant Profile Input Block (Name, Title, Hospital) */}
                    <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-indigo-100/80 pb-2">
                        <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                          <User className="h-4 w-4 text-indigo-600 shrink-0" />
                          填答基本資料：
                        </span>
                        <span className="text-[10px] text-indigo-700/80 font-semibold bg-indigo-100/70 px-2 py-0.5 rounded-md">
                          🔒 大螢幕貼出維持匿名
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* 1. 姓名 */}
                        <div>
                          <label className="text-[11px] font-extrabold text-slate-700 block mb-1">
                            姓名 / 暱稱：
                          </label>
                          <input
                            type="text"
                            value={userName}
                            onChange={(e) => handleUserNameChange(e.target.value)}
                            placeholder="例：王小明 (預設匿名)"
                            className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 placeholder:text-slate-400 font-medium"
                            maxLength={20}
                            disabled={loading}
                          />
                        </div>

                        {/* 2. 職級 */}
                        <div>
                          <label className="text-[11px] font-extrabold text-slate-700 block mb-1 flex items-center gap-1">
                            <Briefcase className="h-3 w-3 text-slate-500" />
                            職級 / 職稱：
                          </label>
                          <input
                            type="text"
                            value={userTitle}
                            onChange={(e) => handleUserTitleChange(e.target.value)}
                            placeholder="例：主治醫師 / 護理師 / PG"
                            className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 placeholder:text-slate-400 font-medium"
                            maxLength={25}
                            disabled={loading}
                          />
                        </div>

                        {/* 3. 醫院 / 單位 */}
                        <div>
                          <label className="text-[11px] font-extrabold text-slate-700 block mb-1 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-slate-500" />
                            醫院 / 單位：
                          </label>
                          <input
                            type="text"
                            value={userHospital}
                            onChange={(e) => handleUserHospitalChange(e.target.value)}
                            placeholder="例：花蓮慈濟 / 台大醫院"
                            className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 placeholder:text-slate-400 font-medium"
                            maxLength={30}
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ERROR STATE */}
                    {errorText && (
                      <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-700 font-medium text-xs flex items-center gap-2">
                        <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                        <span>{errorText}</span>
                      </div>
                    )}

                    {/* POLL INPUT FORM */}
                    {activeQuestion.type === "poll" ? (
                      <form onSubmit={handleSubmit} className="space-y-5">
                        <label className="text-xs font-black text-slate-700 block">
                          請點選您的投票選項：
                        </label>

                        <div className="space-y-2.5">
                          {(activeQuestion.options && activeQuestion.options.length > 0
                            ? activeQuestion.options
                            : ["同意", "普通", "不同意"]
                          ).map((opt, idx) => {
                            const isSelected = selectedOption === opt;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setSelectedOption(opt);
                                  if (errorText) setErrorText(null);
                                }}
                                className={`w-full p-3.5 rounded-xl border text-left font-bold text-xs transition-all flex items-center justify-between cursor-pointer select-none ${
                                  isSelected
                                    ? "bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-300 shadow-xs"
                                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                                }`}
                              >
                                <span className="flex items-center gap-2.5">
                                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center font-mono text-[10px] ${
                                    isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 text-slate-400"
                                  }`}>
                                    {String.fromCharCode(65 + idx)}
                                  </span>
                                  <span>{opt}</span>
                                </span>

                                {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="submit"
                          disabled={loading || !selectedOption}
                          className="w-full flex justify-center items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white transition-all duration-200 py-3.5 px-8 text-sm font-black shadow-lg shadow-emerald-100 hover:shadow-emerald-200 active:scale-95 transform cursor-pointer select-none"
                        >
                          {loading ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              記錄投票中...
                            </>
                          ) : (
                            <>
                              <Vote className="h-4 w-4 text-emerald-200" />
                              🚀 投出寶貴一票 (限投 1 次)
                            </>
                          )}
                        </button>
                      </form>
                    ) : (
                      /* WORD CLOUD TEXTAREA FORM */
                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-700 flex justify-between">
                            <span>輸入您的反思、評論或臨床經驗：</span>
                            <span className="text-[10px] text-slate-400 font-normal">限 500 字</span>
                          </label>
                          <textarea
                            value={inputText}
                            onChange={(e) => {
                              setInputText(e.target.value.substring(0, 500));
                              if (errorText) setErrorText(null);
                            }}
                            placeholder="請分享您的反思或關鍵觀點，例如：建議導入客觀多元臨床評估工具..."
                            className="w-full text-xs rounded-xl border border-slate-200 p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/70 hover:bg-slate-50 transition min-h-[110px] text-slate-800 placeholder:text-slate-400 shadow-inner"
                            rows={4}
                            disabled={loading}
                            required
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                          <span className="text-[10px] text-slate-400 font-medium max-w-[200px] leading-normal">
                            * 採完全匿名，送出後文字將即時於投影呈現 (限回答 1 次)。
                          </span>
                          
                          <button
                            type="submit"
                            disabled={loading || !inputText.trim()}
                            className="w-full sm:w-auto flex justify-center items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white transition-all duration-200 py-3.5 px-8 text-sm font-black shadow-lg shadow-indigo-100 hover:shadow-indigo-200 active:scale-95 transform shrink-0 cursor-pointer select-none"
                          >
                            {loading ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                提交並投影中...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 text-teal-300" />
                                🚀 立即送出 Idea (限送 1 次)
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 2. PRESENTATION MODE (UNLOCKED FULL WORKSHOP STATS & MY HISTORY) */}
            {viewMode === "presentation" && (
              <div className="space-y-6 fade-in">
                
                {/* Unlocked Banner */}
                <div className="p-4 bg-teal-50/80 rounded-2xl border border-teal-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0" />
                      <span className="font-extrabold text-teal-900 text-xs">🎉 已解鎖大會現場即時看板！</span>
                    </div>
                    {hasSubmittedCurrent ? (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2.5 py-1 rounded-full border border-slate-300/60">
                        🔒 已作答 (每題限投 1 次)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setViewMode("answering")}
                        className="text-xs text-indigo-700 hover:text-indigo-900 font-extrabold underline cursor-pointer"
                      >
                        ✏️ 進入作答
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 pl-7 leading-relaxed">
                    您的想法已即時送出並對齊大會指標。下方為目前現場參與者的真實統計分佈！
                  </p>
                </div>

                {/* MY SUBMISSION RECORD */}
                {mySubmissions.length > 0 && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-slate-500" />
                        我的作答/投票紀錄 ({mySubmissions.length})
                      </h3>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {mySubmissions.map((sub) => (
                        <div key={sub.id} className="p-2.5 bg-white rounded-lg border border-slate-150 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="text-slate-800 font-extrabold italic truncate">
                              "{sub.text}"
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono block truncate">
                              填答者：{sub.userName || "匿名"}{sub.userTitle ? ` (${sub.userTitle})` : ""}{sub.userHospital ? ` @ ${sub.userHospital}` : ""}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                            ✓ 已記錄
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LIVE WORKSHOP STATS DISTRIBUTION */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <BarChart className="h-3.5 w-3.5 text-indigo-600" />
                    大會總體即時統計 (Live Distribution)
                  </h3>

                  {activeQuestion.type === 'poll' ? (
                    <div className="space-y-2.5">
                      {Object.entries(pollStats).map(([opt, count], idx) => {
                        const percent = answers.length > 0 ? Math.round((count / answers.length) * 100) : 0;
                        const color = flatColors[idx % flatColors.length];
                        return (
                          <div key={opt} className="p-2.5 bg-slate-50 rounded-xl border border-slate-150 space-y-1">
                            <div className="flex justify-between text-xs font-bold text-slate-800">
                              <span>{opt}</span>
                              <span className="font-mono text-indigo-700">{count} 票 ({percent}%)</span>
                            </div>
                            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {Object.entries(catStats).map(([cat, val], idx) => {
                        if (cat === "Other" && val === 0) return null;
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
                    </div>
                  )}
                </div>

                {/* LIVE RESPONSES FEED WITH LIKES */}
                {activeQuestion.type !== 'poll' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
                        現場夥伴觀點與按讚互動 ({answers.length})
                      </h3>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        點擊 ❤️ 為認同的觀點投票
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {answers.length > 0 ? (
                        [...answers]
                          .sort((a, b) => (b.likes || 0) - (a.likes || 0))
                          .map((ans) => {
                            const isLikedByMe = localStorage.getItem(`cbme_liked_${ans.id}`) === "true";
                            const likesCount = ans.likes || 0;

                            return (
                              <div
                                key={ans.id}
                                className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 flex-1">
                                  <p className="text-slate-850 font-semibold leading-relaxed">
                                    "{ans.text}"
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    <span>#{ans.userName || "匿名"}</span>
                                    {ans.userTitle && <span>• {ans.userTitle}</span>}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleLikeAnswer(activeQuestion.id, ans.id)}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition flex items-center gap-1 cursor-pointer select-none border active:scale-95 shrink-0 ${
                                    isLikedByMe
                                      ? "bg-rose-500 text-white border-rose-600 shadow-2xs"
                                      : "bg-white text-rose-600 border-rose-200 hover:bg-rose-50"
                                  }`}
                                  title="為此觀點點讚愛心"
                                >
                                  <Heart className={`h-3.5 w-3.5 ${isLikedByMe ? "fill-white text-white" : "fill-rose-500 text-rose-500"}`} />
                                  <span>{likesCount}</span>
                                </button>
                              </div>
                            );
                          })
                      ) : (
                        <p className="text-center py-6 text-xs text-slate-400 italic">
                          尚無參與者輸入想法...
                        </p>
                      )}
                    </div>
                  </div>
                )}

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
