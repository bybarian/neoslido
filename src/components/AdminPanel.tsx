import React, { useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Plus, Trash2, Play, CircleAlert, ToggleLeft, ToggleRight, Sparkles, 
  BarChart3, RefreshCw, Layers, Clipboard, Users, LogIn, ChevronRight, Check,
  QrCode, Settings, Settings2, Copy, Lock, Unlock, Monitor, Edit3, Image,
  Eye, EyeOff, Vote, KeyRound
} from "lucide-react";
import { 
  collection, query, onSnapshot, doc, setDoc, addDoc, getDocs, deleteDoc, 
  writeBatch, serverTimestamp, updateDoc 
} from "firebase/firestore";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { Question, Answer } from "../types";
import { QRCodeSVG } from "qrcode.react";

interface AdminPanelProps {
  role?: "presenter" | "participant";
  setRole?: (role: "presenter" | "participant") => void;
  isolatedMode?: boolean;
}

export default function AdminPanel({ role, setRole, isolatedMode }: AdminPanelProps) {
  const [user, setUser] = useState<User | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answersMap, setAnswersMap] = useState<{ [qId: string]: Answer[] }>({});
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  
  // Custom headers state (上面標題自行放入)
  const [headerTitle, setHeaderTitle] = useState("2026 CBME Taiwan Week × AI Workshop");
  const [headerSubtitle, setHeaderSubtitle] = useState("Leading CBME reform in the AI era • AI輔助互動交流系統");
  const [sponsor1, setSponsor1] = useState("國泰綜合醫院");
  const [sponsor1Sub, setSponsor1Sub] = useState("Cathay General Hospital");
  const [sponsor2, setSponsor2] = useState("中國醫藥大學附設醫院");
  const [sponsor2Sub, setSponsor2Sub] = useState("China Medical University Hospital");
  const [bannerType, setBannerType] = useState<"default" | "image">("image");
  const [bannerBgUrl, setBannerBgUrl] = useState("");
  
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem("cbme_gemini_api_key") || (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
  });

  // Admin lock states
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem("cbme_admin_unlocked") === "true";
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleUnlock = () => {
    if (passwordInput === "00000") {
      setIsAdminUnlocked(true);
      localStorage.setItem("cbme_admin_unlocked", "true");
      setPasswordInput("");
      setPasswordError("");
      showMessage("🔓 管理權限驗證成功！已解鎖大會看版自訂與題目設計控制台。", "success");
    } else {
      setPasswordError("密碼錯誤，請輸入授權解鎖密碼");
      showMessage("❌ 密碼錯誤，拒絕存取管理工作區。", "error");
    }
  };

  const handleLock = () => {
    setIsAdminUnlocked(false);
    localStorage.removeItem("cbme_admin_unlocked");
    showMessage("🔒 已鎖定管理控制台。防學員隨意誤觸修改。", "success");
  };
  const [copied, setCopied] = useState(false);

  // Create / Edit state
  const [newTitle, setNewTitle] = useState("");
  const [questionType, setQuestionType] = useState<'wordcloud' | 'poll'>('wordcloud');
  const [options, setOptions] = useState<string[]>(["強烈同意", "同意", "普通", "不同意", "強烈不同意"]);
  const [pendingOption, setPendingOption] = useState("");
  const [newCategories, setNewCategories] = useState<string[]>(["臨床決策", "醫病溝通", "學術倫理", "行政效率"]);
  const [pendingCategory, setPendingCategory] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Custom visual presenting mode: 'chart' (bar statistics) or 'wordcloud' (cloud tag map)
  const [presentMode, setPresentMode] = useState<"chart" | "wordcloud">("chart");
  // Manage batch AI classification progress state
  const [analyzingBatch, setAnalyzingBatch] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  // Custom Category Selection & Question Editing Hooks
  const historicalCategories = React.useMemo(() => {
    const uniqueCats = new Set<string>();
    // Pre-seed with helpful standard medical education domains
    const defaults = ["臨床決策", "醫病溝通", "學術倫理", "行政效率", "教學評估", "專業素養", "團隊合作", "終身學習", "系統思維", "科學研究"];
    defaults.forEach(d => uniqueCats.add(d));
    
    questions.forEach(q => {
      if (q.categories) {
        q.categories.forEach(c => {
          if (c && c.trim()) {
            uniqueCats.add(c.trim());
          }
        });
      }
    });
    return Array.from(uniqueCats);
  }, [questions]);

  const handleStartEdit = (q: Question) => {
    setEditingQuestionId(q.id);
    setNewTitle(q.title);
    setNewCategories(q.categories);
    setNewImageUrl(q.imageUrl || "");
    setQuestionType(q.type || 'wordcloud');
    setOptions(q.options && q.options.length > 0 ? q.options : ["強烈同意", "同意", "普通", "不同意", "強烈不同意"]);
    setShowCreateForm(true);
    // Find the element and scroll to it smoothly
    const formElement = document.getElementById("admin-question-form-container");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCancelForm = () => {
    setEditingQuestionId(null);
    setNewTitle("");
    setNewCategories(["臨床決策", "醫病溝通", "學術倫理", "行政效率"]);
    setNewImageUrl("");
    setQuestionType('wordcloud');
    setOptions(["強烈同意", "同意", "普通", "不同意", "強烈不同意"]);
    setShowCreateForm(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMessage("請選擇格式正確的圖片檔案", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        // Target max dimension for compressed image
        const maxDim = 500;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7); // 70% quality JPEG
          setNewImageUrl(compressedBase64);
          showMessage("圖片上傳並壓縮成功！", "success");
        } else {
          setNewImageUrl(event.target?.result as string);
          showMessage("圖片上傳成功！", "success");
        }
      };
      img.onerror = () => {
        setNewImageUrl(event.target?.result as string);
        showMessage("圖片上傳成功！", "success");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    setSelectedTerm(null);
  }, [activeQuestion?.id]);

  // Generate real-time Participant URL with query param
  useEffect(() => {
    const origin = window.location.origin || "https://ai.studio/build";
    setJoinUrl(`${origin}?role=participant`);
  }, []);

  // Monitor dynamic workshop header settings in Firestore (sync real-time)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "workshop"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setHeaderTitle(data.title || "2026 CBME Taiwan Week × AI Workshop");
        setHeaderSubtitle(data.subtitle || "Leading CBME reform in the AI era • AI輔助互動交流系統");
        setSponsor1(data.sponsor1Name || "");
        setSponsor1Sub(data.sponsor1Sub || "");
        setSponsor2(data.sponsor2Name || "");
        setSponsor2Sub(data.sponsor2Sub || "");
        setBannerType(data.bannerType || "image");
        setBannerBgUrl(data.bannerBgUrl || "");
      }
    }, (err) => {
      console.warn("Error reading custom header settings:", err);
    });
    return () => unsub();
  }, []);

  // Save Dynamic header settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showMessage("請先登入講者帳號後，再進行標題更新設定！", "error");
      return;
    }
    setLoading(true);
    try {
      await setDoc(doc(db, "settings", "workshop"), {
        title: headerTitle.trim(),
        subtitle: headerSubtitle.trim(),
        sponsor1Name: sponsor1.trim(),
        sponsor1Sub: sponsor1Sub.trim(),
        sponsor2Name: sponsor2.trim(),
        sponsor2Sub: sponsor2Sub.trim(),
        bannerType: bannerType,
        bannerBgUrl: bannerBgUrl.trim(),
        updatedAt: serverTimestamp()
      });
      setShowSettingsForm(false);
      showMessage("大會看版與客製 Banner 已成功發布更新！秒級即時同步至全部學員與大螢幕。", "success");
    } catch (error) {
      console.error(error);
      showMessage("無法發布標題更新。請檢查 Firebase 讀寫權限與帳號登入狀態。", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    showMessage("手機作答專屬網址已複製到剪貼簿！", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  // One-click AI classification generator for all pending answers (一鍵智慧歸納分析功能)
  const handleBatchAnalyze = async (questionId: string, categories: string[]) => {
    const answers = answersMap[questionId] || [];
    const pendingItems = answers.filter(a => a.category === "Pending");
    
    if (pendingItems.length === 0) {
      showMessage("💡 所有現場學員的想法皆已歸類完畢！", "success");
      return;
    }

    setAnalyzingBatch(true);
    showMessage(`🤖 啟動 Gemini 一鍵 AI 智慧分析：正在歸納配對現場 ${pendingItems.length} 筆回覆...`, "success");

    let results: { id: string; category: string }[] = [];
    let methodUsed = "API Server";

    try {
      const keyToUse = geminiApiKey || (import.meta.env.VITE_GEMINI_API_KEY as string);

      if (keyToUse) {
        methodUsed = "Client Gemini Direct (瀏覽器端直接解析)";
        console.log("Using browser-side Gemini client for prediction...");
        const ai = new GoogleGenAI({ apiKey: keyToUse });
        
        const prompt = `You are an expert workshop categorizer.
Given those participant feedback responses:
${JSON.stringify(pendingItems.map(it => ({ id: it.id, text: it.text })))}

And the allowed categories list:
${JSON.stringify(categories)}

Classify each response into exactly one of the allowed categories. If any response does not fit any specified category, assign it as "Other".`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "Classify multiple feedback items into exact categories. Be objective and precise, returning a valid JSON array format as specified.",
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                results: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: { type: "STRING" },
                      category: { 
                        type: "STRING", 
                        description: "The classified category. Must be an exact match to one of the allowed categories or 'Other'." 
                      }
                    },
                    required: ["id", "category"]
                  }
                }
              },
              required: ["results"]
            }
          }
        });

        const responseText = response.text || "";
        try {
          const parsed = JSON.parse(responseText.trim());
          results = parsed.results || [];
        } catch (err) {
          console.error("Failed to parse browser Gemini batch classification response:", responseText, err);
          results = pendingItems.map(it => {
            const matched = categories.find(c => responseText.toLowerCase().includes(c.toLowerCase()));
            return { id: it.id, category: matched || "Other" };
          });
        }
      } else {
        // Fallback to Server-Side API call
        const response = await fetch("/api/analyze-batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            items: pendingItems.map(item => ({ id: item.id, text: item.text })),
            categories: categories
          })
        });

        if (!response.ok) {
          throw new Error("一鍵 AI 智慧分析失敗，請檢查伺服器連線，或在「自訂大會看版與客製 Banner」設定中點選設定您的 瀏覽器端備用 Gemini Key。");
        }

        const data = await response.json();
        results = data.results || [];
      }

      if (results.length === 0) {
        throw new Error("無效的歸類結果，請重試");
      }

      // Update Firestore documents in parallel or batch
      const updatePromises = results.map((res: { id: string; category: string }) => {
        return updateDoc(doc(db, `questions/${questionId}/answers`, res.id), {
          category: res.category
        });
      });

      await Promise.all(updatePromises);
      showMessage(`🎉 一鍵智慧分類完成 (${methodUsed})！已成功將 ${results.length} 筆回應對齊大會核心指標。`, "success");
    } catch (error) {
      console.error("Batch classification failed:", error);
      showMessage(error instanceof Error ? error.message : "智慧歸納失敗，請確認網路與權限。", "error");
    } finally {
      setAnalyzingBatch(false);
    }
  };

  // Helper to extract word cloud frequencies from participant answers (中文醫療切語頻率分析)
  const extractWordCloudTerms = (answers: Answer[]) => {
    const wordsMap: { [key: string]: number } = {};
    
    // Stopwords for Chinese and English medical terms
    const stopWords = new Set([
      "的", "了", "在", "是", "我", "你", "他", "與", "及", "或", "和", "這", "那", "有", "也", "就", "都", "", " ",
      "這個", "那個", "一個", "一些", "可以", "我們", "他們", "應該", "如何", "甚麼", "什麼", "覺得", "非常", "需要", "例如",
      "的、", "以及", "目前", "對於", "希望", "進行", "透過", "協助", "提供", "能夠", "針對", "部分", "可能", "已經", "具有",
      "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "for", "with", "on", "at", "by", "from", "as", "is"
    ]);

    answers.forEach(ans => {
      // Split on punctuation/spaces
      const segments = ans.text.split(/[\s,.\/、，。：；！？?!()（）""''「」『』]+/);
      segments.forEach(seg => {
        const cleanSeg = seg.trim();
        if (!cleanSeg) return;
        
        // If word length is suitable
        if (cleanSeg.length >= 2 && cleanSeg.length <= 15) {
          if (!stopWords.has(cleanSeg.toLowerCase()) && isNaN(Number(cleanSeg))) {
            wordsMap[cleanSeg] = (wordsMap[cleanSeg] || 0) + 1;
          }
        } else if (cleanSeg.length > 15) {
          for (let i = 0; i < cleanSeg.length - 1; i++) {
            const bi = cleanSeg.substring(i, i + 2);
            if (bi.length === 2 && !stopWords.has(bi) && isNaN(Number(bi))) {
              wordsMap[bi] = (wordsMap[bi] || 0) + 0.5;
            }
            if (i < cleanSeg.length - 2) {
              const tri = cleanSeg.substring(i, i + 3);
              if (tri.length === 3 && !stopWords.has(tri) && isNaN(Number(tri))) {
                wordsMap[tri] = (wordsMap[tri] || 0) + 0.6;
              }
            }
          }
        }
      });
    });

    const list = Object.entries(wordsMap)
      .map(([text, value]) => ({ text, value: Math.round(value) }))
      .filter(item => item.value >= 1)
      .sort((a, b) => b.value - a.value);

    return list.slice(0, 35);
  };

  // Monitor auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
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
      // Sort: active questions first, then by creation date descending
      qList.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      
      setQuestions(qList);
      
      const currentActive = qList.find(item => item.isActive);
      setActiveQuestion(currentActive || qList[0] || null);
    }, (error) => {
      console.error("Error subscribing to questions:", error);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to answers for questions
  useEffect(() => {
    if (questions.length === 0) return;
    
    const unsubscribes = questions.map((question) => {
      const path = `questions/${question.id}/answers`;
      return onSnapshot(collection(db, path), (snapshot) => {
        const answersList: Answer[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          answersList.push({
            id: docSnap.id,
            text: data.text || "",
            category: data.category || "Other",
            createdAt: data.createdAt,
            userId: data.userId || ""
          });
        });
        
        // Sort answers latest first
        answersList.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setAnswersMap(prev => ({
          ...prev,
          [question.id]: answersList
        }));
      }, (error) => {
        // Safe wrap error handle without breaking layout
        handleFirestoreError(error, OperationType.LIST, path);
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [questions]);

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showMessage("講者登入成功！", "success");
    } catch (error) {
      console.error(error);
      showMessage("登入失敗，可能在 iframe 中受限", "error");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    showMessage("已登出講者帳戶", "success");
  };

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const addCategoryTag = () => {
    const trimmed = pendingCategory.trim();
    if (trimmed && !newCategories.includes(trimmed)) {
      setNewCategories([...newCategories, trimmed]);
      setPendingCategory("");
    }
  };

  const removeCategoryTag = (indexToRemove: number) => {
    setNewCategories(newCategories.filter((_, i) => i !== indexToRemove));
  };

  // Seed default questions if list is empty
  const handleSeedDefaults = async () => {
    if (!user) {
      showMessage("請先登入後再進行此操作", "error");
      return;
    }
    setLoading(true);
    try {
      const defaults = [
        {
          title: "未來醫學教育中，AI 輔助評估 (AI-Assisted Assessment) 最具挑戰性的部分是什麼？",
          categories: ["評分公平性與偏差", "演算法黑盒子透明度", "教師適應科技抗拒", "學員資安隱私保護", "Mile-stones指標結合"],
          isActive: true
        },
        {
          title: "在臨床情境教學中，您認為 AI 最能幫助提升學員的哪項核心能力？",
          categories: ["臨床診斷邏推理", "醫病溝通技巧", "臨床決策與應變", "醫療病歷病程寫作", "跨專業團隊協作"],
          isActive: false
        },
        {
          title: "您目前在您的教學或臨床現場，是否有嘗試過以下何種類型的 AI 工具？",
          categories: ["學術論文摘要與翻譯", "虛擬教案劇本生成", "虛擬標準病人對話模擬", "簡報與教材影音製作", "尚未嘗試過任何工具"],
          isActive: false
        }
      ];

      for (const item of defaults) {
        const questionId = "q_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        await setDoc(doc(db, "questions", questionId), {
          title: item.title,
          categories: item.categories,
          isActive: item.isActive,
          createdAt: serverTimestamp()
        });
      }
      showMessage("預設演示題目新增完畢！", "success");
    } catch (error) {
      console.error(error);
      showMessage("無法生成預設題目。請確認 Firebase 規則與登入狀態。", "error");
    } finally {
      setLoading(false);
    }
  };

  // Create or Edit customized question
  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user && !isAdminUnlocked) {
      showMessage("請先使用 Google 帳號登入講者身份或是解鎖控制台！", "error");
      return;
    }
    if (!newTitle.trim()) {
      showMessage("題目內容不能為空", "error");
      return;
    }
    if (newCategories.length === 0) {
      showMessage("請至少定義一個回覆分類類別", "error");
      return;
    }

    if (questionType === 'poll' && options.length < 2) {
      showMessage("投票模式至少需要設定 2 個選項！", "error");
      return;
    }

    setLoading(true);
    try {
      if (editingQuestionId) {
        // Edit flow
        await updateDoc(doc(db, "questions", editingQuestionId), {
          title: newTitle.trim(),
          categories: newCategories,
          type: questionType,
          options: questionType === 'poll' ? options : [],
          imageUrl: newImageUrl.trim() || null,
          updatedAt: serverTimestamp()
        });
        showMessage("題目已成功修改並即時更新！", "success");
      } else {
        // Create flow
        const questionId = "q_" + Date.now();
        
        // If we are making this active, deactivate others
        const batchList: Promise<any>[] = [];
        
        await setDoc(doc(db, "questions", questionId), {
          title: newTitle.trim(),
          categories: newCategories,
          type: questionType,
          options: questionType === 'poll' ? options : [],
          imageUrl: newImageUrl.trim() || null,
          isActive: true, // Auto active
          createdAt: serverTimestamp()
        });

        // Deactivate all sibling questions
        questions.forEach(q => {
          if (q.id !== questionId && q.isActive) {
            batchList.push(updateDoc(doc(db, "questions", q.id), { isActive: false }));
          }
        });

        await Promise.all(batchList);
        showMessage("AI 互動題目建立成功，已自動設為目前投影中！", "success");
      }

      // Reset form variables
      setNewTitle("");
      setNewCategories(["臨床決策", "醫病溝通", "學術倫理", "行政效率"]);
      setNewImageUrl("");
      setQuestionType('wordcloud');
      setOptions(["強烈同意", "同意", "普通", "不同意", "強烈不同意"]);
      setEditingQuestionId(null);
      setShowCreateForm(false);
    } catch (error) {
      console.error(error);
      showMessage("操作失敗，請檢查權限。", "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle active question state (set active or inactive)
  const handleToggleActive = async (questionId: string, currentStatus: boolean) => {
    if (!user && !isAdminUnlocked) {
      showMessage("請先登入講者或是解鎖控制台", "error");
      return;
    }
    try {
      if (currentStatus) {
        // If already active, toggle off so no questions are active
        await updateDoc(doc(db, "questions", questionId), { isActive: false });
        showMessage("本題已成功停止播放，所有學員畫面已切換至等待模式！", "success");
      } else {
        // Activate this question, set all others to inactive
        const updates = questions.map(q => {
          const isTarget = q.id === questionId;
          return updateDoc(doc(db, "questions", q.id), { isActive: isTarget });
        });
        await Promise.all(updates);
        showMessage("投影題目已成功啟動！所有參與者與投影大螢幕將即時同步。", "success");
      }
    } catch (error) {
      console.error(error);
      showMessage("切換失敗", "error");
    }
  };

  // Clear answers (reset)
  const handleResetAnswers = (questionId: string) => {
    if (!user && !isAdminUnlocked) {
      showMessage("請先登入講者或是解鎖控制台", "error");
      return;
    }
    requestConfirm(
      "重設答覆動作確認",
      "確定要重設並清空這道題目的所有參與者回覆與統計圖表嗎？此動作無法復原。",
      async () => {
        setLoading(true);
        try {
          const answers = answersMap[questionId] || [];
          const deletePromises = answers.map(ans => 
            deleteDoc(doc(db, `questions/${questionId}/answers`, ans.id))
          );
          await Promise.all(deletePromises);
          showMessage("本題答案已清空！統計圖表已重設。", "success");
        } catch (error) {
          console.error(error);
          showMessage("清空失敗", "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Delete single Answer
  const handleDeleteAnswer = (answerId: string) => {
    if (!user && !isAdminUnlocked) {
      showMessage("請先登入講者或是解鎖控制台", "error");
      return;
    }
    if (!focusedQuestion) return;
    requestConfirm(
      "刪除答覆確認",
      "確定要刪除這筆參與者的想法回覆嗎？此動作無法復原。",
      async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, `questions/${focusedQuestion.id}/answers`, answerId));
          showMessage("該想法已成功刪除！", "success");
        } catch (error) {
          console.error(error);
          showMessage("刪除失敗", "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Delete Question
  const handleDeleteQuestion = (questionId: string) => {
    if (!user) {
      showMessage("請先登入講者", "error");
      return;
    }
    requestConfirm(
      "刪除互動題目確認",
      "確定要刪除此互動題目嗎？連同底下所有的學員回覆統計也將一併刪除，此動作無法復原。",
      async () => {
        setLoading(true);
        try {
          // First clean answers
          const answers = answersMap[questionId] || [];
          const cleanPromises = answers.map(ans => 
            deleteDoc(doc(db, `questions/${questionId}/answers`, ans.id))
          );
          await Promise.all(cleanPromises);
          
          // Delete question document
          await deleteDoc(doc(db, "questions", questionId));
          showMessage("題目已刪除", "success");
        } catch (error) {
          console.error(error);
          showMessage("刪除失敗", "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Prepare and calculate stats for currently focused presentation
  const focusedQuestion = activeQuestion || questions[0] || null;
  const focusedAnswers = focusedQuestion ? (answersMap[focusedQuestion.id] || []) : [];
  
  // Calculate category frequencies
  const categoryStats: { [category: string]: number } = {};
  if (focusedQuestion) {
    focusedQuestion.categories.forEach(c => {
      categoryStats[c] = 0;
    });
    categoryStats["Other"] = 0; // fallback for unclassified

    focusedAnswers.forEach(ans => {
      const cat = ans.category;
      if (categoryStats[cat] !== undefined) {
        categoryStats[cat]++;
      } else {
        // If it got categorized as something outside (e.g. customized on previous settings), fallback to either matches or other
        const exactMatch = focusedQuestion.categories.find(c => c.toLowerCase() === cat.toLowerCase());
        if (exactMatch) {
          categoryStats[exactMatch]++;
        } else {
          categoryStats["Other"]++;
        }
      }
    });
  }

  // Predefined gorgeous clinical palette
  const flatColors = [
    "#0e7490", // Cyan/Teal
    "#b91c1c", // Crimson red
    "#0369a1", // Light Blue
    "#f59e0b", // Amber/Gold
    "#4d7c0f", // Lime Green
    "#6d28d9", // Grape Violet
    "#be185d", // Deep Pink
    "#57534e", // Slate Stone
  ];

  const totalAnswersCount = focusedAnswers.length;

  // Find the top category
  let topCategory = "暫無數據";
  let maxCount = 0;
  Object.entries(categoryStats).forEach(([cat, val]) => {
    if (val > maxCount && cat !== "Other") {
      topCategory = cat;
      maxCount = val;
    }
  });

  if (!isAdminUnlocked) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        {/* Feedback Alert */}
        {message && (
          <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg fade-in text-sm font-semibold text-white ${
            message.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}>
            <span>{message.text}</span>
          </div>
        )}

        <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-indigo-100 p-8 space-y-6 text-center animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-indigo-100 text-indigo-950 flex items-center justify-center shadow-md">
            <Lock className="h-8 w-8 text-indigo-800" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">
              🔐 大會講者控制台 權限驗證鎖定
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              本區域為講者與主持人專用主控台（包含題目設計、現場投放切換與大會動態標題）。請輸入講者授權密碼以解鎖管理權限。
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition"
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
              驗證密碼並解鎖講者控制台
            </button>
          </div>

          {setRole && (
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRole("participant")}
                className="text-xs font-bold text-slate-400 hover:text-indigo-700 transition cursor-pointer"
              >
                ← 返回學員互動端
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feedback Alert */}
      {message && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg fade-in text-sm font-semibold text-white ${
          message.type === "success" ? "bg-emerald-600" : "bg-rose-600"
        }`}>
          <span>{message.text}</span>
        </div>
      )}

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

      {/* Header Admin LogIn status Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-cyan-500/20 p-2 text-cyan-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-wide">
              講者主控管理端（CBME 大會投影模式）
            </h3>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {user ? `已登入: ${user.email} (可安全儲存與發布)` : "🔴 目前為匿名預覽模式，請登入講者帳戶以新增或重設題目"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {!user ? (
            <button
              onClick={handleLogin}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 transition px-4 py-2 text-xs font-bold text-white shadow-sm cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              使用 Google 登入講者
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 transition px-3 py-1.5 text-xs font-bold text-slate-300 border border-slate-700 cursor-pointer"
            >
              登出
            </button>
          )}
        </div>
      </div>

      {/* [NEW] TOP-LEVEL MULTI-COLUMN INTERACTIVE QUESTION & CATEGORY SETUP MANAGER */}
      {isAdminUnlocked && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4 animate-fade-in relative overflow-hidden mb-6 mt-6">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-500 via-cyan-600 to-indigo-500" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-150 pb-3">
            <div className="space-y-1">
              <h3 className="font-display font-black text-slate-800 text-base flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-cyan-600" />
                🏆 互動題目與類別指標管理器 (Question & Category Manager)
              </h3>
              <p className="text-[11px] text-slate-500 leading-normal">
                在此自訂與發布互動題目、設定學員端 AI 歸納指標範疇。此管理區已移至頂部寬屏，右側平行顯示學員手機端/投影端即時畫面預覽。
              </p>
            </div>
            
            {!user && questions.length === 0 && (
              <button
                type="button"
                onClick={handleSeedDefaults}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-605 text-rose-600 border border-rose-100 font-bold flex items-center gap-1 hover:bg-rose-100 transition h-fit cursor-pointer"
              >
                <RefreshCw className="h-3 w-3 animate-spin-slow" />
                產生臨床演示預設題目
              </button>
            )}
          </div>

          {/* Quick warning if not signed in */}
          {!user && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 leading-relaxed flex gap-2">
              <CircleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">講者功能限制中</span>：您可自由瀏覽統計與答題，但在雲端建立/切換題目設定需於頂端登入 Google 講者帳號。
              </div>
            </div>
          )}

          {/* CREATE CUSTOM QUESTION FORM TOGGLER */}
          <div id="admin-question-form-container" className="scroll-mt-6">
            {!showCreateForm ? (
              <button
                type="button"
                onClick={() => {
                  setEditingQuestionId(null);
                  setNewTitle("");
                  setNewCategories(["臨床決策", "醫病溝通", "學術倫理", "行政效率"]);
                  setNewImageUrl("");
                  setShowCreateForm(true);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-800 hover:bg-teal-700 transition py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer select-none"
              >
                <Plus className="h-4 w-4" />
                自訂全新互動題目 (Add Question)
              </button>
            ) : (
              <form onSubmit={handleSubmitQuestion} className="space-y-5 bg-slate-50 p-5 rounded-xl border border-slate-200 relative">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="text-sm font-black text-slate-800 uppercase flex items-center gap-1.5">
                    {editingQuestionId ? "📝 編輯/修改現有互動題目" : "✨ 設計自訂全新互動題目"}
                  </span>
                  <button 
                    type="button" 
                    onClick={handleCancelForm} 
                    className="text-xs text-slate-500 hover:text-slate-800 font-bold bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-lg cursor-pointer transition select-none"
                  >
                    取消編輯
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left side inputs */}
                  <div className="lg:col-span-8 space-y-5">
                    
                    {/* Step 0: 選擇題目模式 */}
                    <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200">
                      <label className="text-[11px] font-black text-slate-700 block uppercase tracking-wider">
                        Step 0: 選擇互動題目模式 (Question Mode)
                      </label>
                      <div className="flex gap-2 p-1 bg-slate-100/80 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setQuestionType('wordcloud')}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                            questionType === 'wordcloud'
                              ? "bg-white text-indigo-900 shadow-xs border border-indigo-200"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Sparkles className="h-4 w-4 text-indigo-500" />
                          <span>☁️ 文字雲 / 簡答想法 (Word Cloud)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionType('poll')}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                            questionType === 'poll'
                              ? "bg-white text-emerald-900 shadow-xs border border-emerald-200"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Vote className="h-4 w-4 text-emerald-600" />
                          <span>📊 投票問卷單選題 (Poll / Vote)</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Title details + image uploads */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-slate-700 block uppercase tracking-wider">
                          Step 1: 題目內容情境 (標題或核心提問)
                        </label>
                        <textarea
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="請輸入提問內容，例如: 您認為醫學教育結合 AI 臨床決策最核心的挑戰是什麼？"
                          className="w-full text-xs rounded-md border border-slate-300 p-2.5 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden leading-relaxed"
                          rows={4}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-700 flex items-center gap-1 uppercase tracking-wider">
                          <Image className="h-3.5 w-3.5 text-slate-500" />
                          Step 2: 情境示意圖片 (選填，可上傳或設定網址)
                        </label>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="url"
                            value={newImageUrl}
                            onChange={(e) => setNewImageUrl(e.target.value)}
                            placeholder="貼上示意圖片網址 URL"
                            className="w-full text-[11px] rounded-md border border-slate-300 px-2.5 py-1.5 focus:ring-1 focus:ring-cyan-500 bg-white"
                          />

                          {/* Direct Upload Section */}
                          <div className="bg-white border border-dashed border-slate-300 rounded-lg p-1.5 hover:border-cyan-400 hover:bg-cyan-50/15 transition text-center relative cursor-pointer flex items-center justify-center">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              id="image-upload-file-input"
                              title="點擊從本機自行上傳圖片"
                            />
                            <div className="flex items-center gap-1.5">
                              <Plus className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-600">本機自行上傳圖片</span>
                            </div>
                          </div>
                        </div>

                        {/* Presets */}
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase">醫學情境推薦範本 (按下一鍵套用)：</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {[
                              { name: "🏥 臨床評估", url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=600&q=80" },
                              { name: "💻 智慧醫療", url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80" },
                              { name: "🧑‍⚕️ 臨床溝通", url: "https://images.unsplash.com/photo-1584515901107-d1776ceaa52b?auto=format&fit=crop&w=600&q=80" },
                              { name: "🎓 醫學教學", url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80" }
                            ].map(preset => (
                              <button
                                key={preset.name}
                                type="button"
                                onClick={() => setNewImageUrl(preset.url)}
                                className={`text-[9px] text-left p-1 rounded border overflow-hidden truncate transition cursor-pointer select-none ${
                                  newImageUrl === preset.url
                                    ? "bg-cyan-50 border-cyan-500 text-cyan-800 font-bold"
                                    : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                                }`}
                              >
                                {preset.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Category tag configurations */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-slate-700 block uppercase tracking-wider">
                            Step 3: 定義 AI 分類範疇 (自訂類別)
                          </label>
                          <span className="text-[9px] text-slate-400 font-extrabold">最多15組</span>
                        </div>
                        
                        {/* Tag lists */}
                        <div className="flex flex-wrap gap-1.5 min-h-[44px] bg-white border border-slate-200 p-2 rounded-md">
                          {newCategories.map((cat, idx) => (
                            <span 
                              key={cat} 
                              className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 px-2 py-0.5 text-[10px] font-bold transition cursor-pointer border border-slate-200"
                              onClick={() => removeCategoryTag(idx)}
                              title="點選移除"
                            >
                              {cat}
                              <span className="text-[9px] text-slate-400">&times;</span>
                            </span>
                          ))}
                          {newCategories.length === 0 && (
                            <span className="text-[10px] text-slate-400 self-center pl-1 font-bold">請輸入並點擊右側 + 號加入</span>
                          )}
                        </div>

                        {/* Tag inputs and additions */}
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={pendingCategory}
                            onChange={(e) => setPendingCategory(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addCategoryTag();
                              }
                            }}
                            placeholder="例如: 智能問答、歷程摘要..."
                            className="flex-1 text-[11px] rounded-md border border-slate-300 px-2.5 py-1.5 focus:ring-1 focus:ring-cyan-500 bg-white"
                          />
                          <button
                            type="button"
                            onClick={addCategoryTag}
                            className="bg-slate-200 hover:bg-slate-300 hover:text-slate-800 transition px-3 rounded-md text-slate-600 text-xs font-bold cursor-pointer"
                          >
                            加入
                          </button>
                        </div>
                      </div>

                      {/* Historical recommend indicators tag board */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                          📚 快速選擇歷史或推薦分類（點選加入/移除）：
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto bg-slate-150/40 p-2 rounded-md border border-slate-200">
                          {historicalCategories.map(cat => {
                            const isAdded = newCategories.includes(cat);
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  if (isAdded) {
                                    setNewCategories(newCategories.filter(c => c !== cat));
                                  } else {
                                    setNewCategories([...newCategories, cat]);
                                  }
                                }}
                                className={`text-[9px] px-2 py-0.5 rounded transition cursor-pointer select-none font-bold ${
                                  isAdded
                                    ? "bg-teal-700 text-white shadow-xs"
                                    : "bg-white hover:bg-slate-200 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {isAdded ? `✓ ${cat}` : `+ ${cat}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                    {/* POLL OPTIONS CONFIGURATION (Only visible when questionType === 'poll') */}
                    {questionType === 'poll' && (
                      <div className="space-y-3 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Vote className="h-4 w-4 text-emerald-600" />
                            Step 2: 設定投票選項 (Poll Options)
                          </label>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                            目前 {options.length} 個選項
                          </span>
                        </div>

                        {/* Presets */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">
                            ⚡ 快速套用常見評量選項範本：
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { name: "5階同意度", list: ["強烈同意", "同意", "普通", "不同意", "強烈不同意"] },
                              { name: "4階滿意度", list: ["極滿意", "滿意", "不滿意", "極不滿意"] },
                              { name: "單選 A/B/C/D", list: ["選項 A", "選項 B", "選項 C", "選項 D"] },
                              { name: "二分法 (是/否)", list: ["是 (Yes)", "否 (No)"] }
                            ].map(preset => (
                              <button
                                key={preset.name}
                                type="button"
                                onClick={() => setOptions(preset.list)}
                                className="text-[10px] px-2.5 py-1 rounded-md bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold transition cursor-pointer shadow-2xs"
                              >
                                {preset.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Options List */}
                        <div className="space-y-2 pt-1">
                          {options.map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-emerald-200/80 shadow-2xs">
                              <span className="text-xs font-mono font-bold text-emerald-700 w-6 text-center shrink-0">
                                #{idx + 1}
                              </span>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...options];
                                  updated[idx] = e.target.value;
                                  setOptions(updated);
                                }}
                                className="flex-1 text-xs font-bold text-slate-800 border-b border-transparent focus:border-emerald-500 focus:outline-hidden px-1"
                                placeholder={`選項 ${idx + 1}`}
                              />
                              {options.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-rose-600 p-1 text-xs transition cursor-pointer"
                                  title="刪除選項"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Add Custom Option Input */}
                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            value={pendingOption}
                            onChange={(e) => setPendingOption(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (pendingOption.trim()) {
                                  setOptions([...options, pendingOption.trim()]);
                                  setPendingOption("");
                                }
                              }
                            }}
                            placeholder="輸入自訂新選項名稱，例如：選項 E"
                            className="flex-1 text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (pendingOption.trim()) {
                                setOptions([...options, pendingOption.trim()]);
                                setPendingOption("");
                              }
                            }}
                            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-2xs shrink-0"
                          >
                            + 新增選項
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right side: Real-time Live Preview Card (平行顯示題目預覽) */}
                  <div className="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      👁️ LIVE CARD PREVIEW (即時投影與學員端預覽)
                    </span>

                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-150 space-y-3">
                      <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[8px] font-black rounded-full uppercase tracking-wider">
                        Q1 ACTIVE QUESTION
                      </span>

                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 leading-snug line-clamp-3">
                          {newTitle.trim() || "( 尚未輸入提問內容，請於左側輸入... )"}
                        </h4>

                        {newImageUrl ? (
                          <div className="h-20 w-full rounded-md overflow-hidden bg-white border border-slate-200 relative flex items-center justify-center">
                            <img 
                              src={newImageUrl} 
                              alt="Ready to project" 
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setNewImageUrl("")}
                              className="absolute top-1 right-1 bg-red-650 hover:bg-red-500 text-white rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer"
                            >
                              移除圖片
                            </button>
                          </div>
                        ) : (
                          <div className="h-20 w-full rounded-md border border-dashed border-slate-250 bg-slate-100/50 flex flex-col items-center justify-center text-slate-400">
                            <Image className="h-5 w-5 mb-0.5 text-slate-350" />
                            <span className="text-[8px] font-bold text-slate-400">(預設無附圖)</span>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-200 pt-2.5">
                        <span className="text-[9px] font-bold text-slate-500 block mb-1">分組對齊指標能力值：</span>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {newCategories.map(cat => (
                            <span key={cat} className="text-[8px] font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                              {cat}
                            </span>
                          ))}
                          {newCategories.length === 0 && (
                            <span className="text-[8px] text-slate-400 font-bold">(無設定指標類別)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-[9px] text-slate-400 leading-relaxed">
                      提示：發布後此題目將自動開啟並即時渲染於前台大螢幕以及所有待作答手機端。
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-150 transition font-bold select-none cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-7 py-2 bg-cyan-700 hover:bg-cyan-600 font-black text-white rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer select-none"
                  >
                    {loading ? "上傳處理中..." : (editingQuestionId ? "💾 確定儲存更新" : "🚀 發布新題，並立刻投放投影！")}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* List of current questions */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider block">
              互動題目與歸納歷程庫 ({questions.length})
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto pr-1">
              {questions.map((q) => {
                const isActive = q.isActive;
                const count = answersMap[q.id]?.length || 0;
                
                return (
                  <div 
                    key={q.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                      isActive 
                        ? "bg-cyan-50/50 border-cyan-400 shadow-xs ring-1 ring-cyan-200" 
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5 border-b border-slate-100 pb-1.5 mb-2">
                        <div className="flex items-start gap-1.5 flex-1">
                          {q.imageUrl && (
                            <img 
                              src={q.imageUrl} 
                              alt="thumb" 
                              className="w-7 h-7 rounded object-cover border border-slate-200 shrink-0 mt-0.5"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <h4 className="text-[11px] font-extrabold text-slate-800 line-clamp-2 leading-tight flex-1">
                            {q.title}
                          </h4>
                        </div>
                        
                        <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {count} 答
                        </span>
                      </div>

                      {/* Display defined categories preview */}
                      <div className="flex flex-wrap gap-1">
                        {q.categories.map((c) => (
                          <span key={c} className="text-[8px] px-1 bg-slate-50 border border-slate-200/50 text-slate-500 font-bold rounded-xs">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Control buttons */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 text-[10px]">
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(q.id, true)}
                          disabled={!user && !isAdminUnlocked}
                          className="text-[9px] font-black text-rose-600 bg-rose-55 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded border border-rose-200 transition cursor-pointer flex items-center gap-1 select-none"
                          title="目前投影進行中，點擊即時【停止投影播放】（下架本題）"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping inline-block shadow-lg" />
                          ■ 停止投放
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(q.id, false)}
                          disabled={!user && !isAdminUnlocked}
                          className="text-[9px] text-cyan-700 bg-cyan-50/50 hover:bg-cyan-100 px-2.5 py-0.5 rounded border border-cyan-155 border-cyan-200 transition cursor-pointer flex items-center gap-1 font-black select-none"
                          title="點擊將本題投射至所有參與者手機與投影大螢幕"
                        >
                          <Play className="h-2 w-2 text-cyan-600" />
                          投放這題
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleResetAnswers(q.id)}
                          disabled={(!user && !isAdminUnlocked) || count === 0}
                          className="text-[9px] text-slate-400 hover:text-slate-600 disabled:opacity-30 font-bold cursor-pointer"
                          title="清空答覆"
                        >
                          重設
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(q)}
                          disabled={!user && !isAdminUnlocked}
                          className="text-[9px] text-cyan-600 hover:text-cyan-800 disabled:opacity-30 transition cursor-pointer flex items-center gap-0.5 font-bold"
                          title="修改題目與範疇"
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          修改
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          disabled={!user && !isAdminUnlocked}
                          className="text-[9px] text-red-400 hover:text-red-700 disabled:opacity-30 transition cursor-pointer"
                          title="刪除題目"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {questions.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-lg col-span-3">
                  尚未建立交流題目。
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid Layout: Left is Presentation Screen (Live Chart & Answers), Right is Configs / Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: ACTIVE PRESENTATION BOARD */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          {focusedQuestion ? (
            <div className="bg-white rounded-xl p-4.5 sm:p-5 border border-slate-200/90 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-600 via-rose-500 to-cyan-500" />
              
              {/* Question header */}
              <div className="flex items-start justify-between gap-4 mt-0.5">
                <span className="inline-flex items-center gap-1 bg-cyan-100 px-2 py-0.5 rounded-full text-[10px] font-bold text-cyan-800">
                  <Play className="h-2.5 w-2.5 fill-cyan-850 fill-cyan-800" />
                  大會目前播放中
                </span>
                
                <div className="text-right text-[11px] text-slate-400 font-mono font-bold">
                  共 {totalAnswersCount} 筆回覆
                </div>
              </div>

              <div className="mt-3 space-y-4">
                <div>
                  <h2 className="text-base md:text-lg font-black text-slate-800 leading-snug">
                    {focusedQuestion.title}
                  </h2>
                </div>

                {focusedQuestion.imageUrl && (
                  <div className="flex justify-center">
                    <div className="max-w-md w-full rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-50 relative flex items-center justify-center p-1">
                      <img
                        src={focusedQuestion.imageUrl}
                        alt={focusedQuestion.title}
                        className="w-full h-auto max-h-[250px] object-contain rounded-lg transition-transform duration-500 hover:scale-[1.02]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>


              {/* [NEW] DUAL-WINDOW MULTITASKING WORKFLOW BANNER */}
              <div className="mt-4 p-3.5 bg-slate-900 text-slate-100 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 border border-slate-800 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400 shrink-0">
                    <Monitor className="h-4.5 w-4.5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white tracking-wide">🖥️ 大會雙螢幕與多分頁操作推薦模式</h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">您可以將「大螢幕視覺看版」在獨立分頁中打開並推至大投影幕；此分頁則保留在您的筆電/平板上作為主控台控制答題與 AI 分類！</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                  <a
                    href="?role=visuals"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-[10px] px-3.5 py-2 rounded-lg transition active:scale-95 shadow-md cursor-pointer select-none"
                  >
                    🚀 開啟大螢幕全螢幕看版
                  </a>
                  <a
                    href="?role=presenter"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] px-2.5 py-2 rounded-lg border border-slate-700 transition active:scale-95 cursor-pointer select-none"
                  >
                    另開主控分頁
                  </a>
                </div>
              </div>

              {/* Dynamic analysis summary banner (一鍵 AI 智慧分析主控) */}
              {totalAnswersCount > 0 ? (
                <div className="mt-5 p-4 bg-cyan-50/40 rounded-xl border border-cyan-150 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 flex-1">
                    <Sparkles className="h-5 w-5 text-cyan-600 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <p className="text-xs font-bold text-cyan-800 uppercase tracking-wider">大會 AI 智慧分析面板 (Real-time AI Center)</p>
                      <p className="text-xs text-slate-650 mt-1 leading-normal">
                        現場已回收：<span className="font-bold text-slate-800 text-sm font-mono">{totalAnswersCount}</span> 筆學員想法
                        {focusedAnswers.filter(a => a.category === "Pending").length > 0 ? (
                          <span className="ml-1.5 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                            ⏳ 尚有 {focusedAnswers.filter(a => a.category === "Pending").length} 筆待分析
                          </span>
                        ) : (
                          <span className="ml-1.5 text-teal-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                            ✅ 已全數分類 (主要傾向: {topCategory})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {/* ONE-CLICK AI BATCH ANALYSIS BUTTON */}
                  <div className="shrink-0 flex items-center gap-2">
                    {focusedAnswers.filter(a => a.category === "Pending").length > 0 ? (
                      <button
                        onClick={() => handleBatchAnalyze(focusedQuestion.id, focusedQuestion.categories)}
                        disabled={analyzingBatch}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition px-4 py-2 text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 animate-pulse"
                      >
                        {analyzingBatch ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            雲端 AI 智慧歸納中...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            一鍵 AI 智慧分類 ({focusedAnswers.filter(a => a.category === "Pending").length} 筆)
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBatchAnalyze(focusedQuestion.id, focusedQuestion.categories)}
                        disabled={analyzingBatch}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-75 *：text-slate-800 transition px-3.5 py-1.5 text-xs font-bold border border-slate-200 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${analyzingBatch ? 'animate-spin' : ''}`} />
                        全員重新歸類分析
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 p-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  等待參與者輸入資料... 本系統將在大家答題完畢後，由您一鍵啟動 AI 將所有想法自動歸納至能力範疇。
                </div>
              )}

              {/* STATS CHARTS / WORD CLOUD SECTIONS */}
              <div className="mt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-150 pb-2.5 gap-2.5">
                  <h3 className="font-display font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-cyan-700" />
                    大會即時視覺看版 (Live Presenter Visuals)
                  </h3>
                  
                  {/* Tab switches */}
                  <div className="flex bg-slate-950 p-1 rounded-full border border-slate-800 text-[11px] self-start sm:self-auto shadow-md">
                    <button
                      type="button"
                      onClick={() => setPresentMode("chart")}
                      className={`px-3 py-1.5 rounded-full font-bold transition cursor-pointer select-none ${
                        presentMode === "chart"
                          ? "bg-slate-800 text-white shadow-sm font-extrabold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📊 能力分佈長條圖
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresentMode("wordcloud")}
                      className={`px-3 py-1.5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer select-none ${
                        presentMode === "wordcloud"
                          ? "bg-slate-800 text-white shadow-sm font-extrabold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ☁️ word cloud
                    </button>
                  </div>
                </div>

                {presentMode === "chart" ? (
                  /* Standard bar statistical statistics chart */
                  <div className="space-y-3.5 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    {Object.entries(categoryStats).map(([category, count], idx) => {
                      const percentage = totalAnswersCount > 0 ? Math.round((count / totalAnswersCount) * 100) : 0;
                      const barColor = flatColors[idx % flatColors.length];

                      if (category === "Other" && count === 0) return null; // Hide Other if empty for clean presentation
                      if (category === "Pending") return null; // We display Pending as prompt or separately

                      return (
                        <div key={category} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-700 flex items-center gap-1.5">
                              <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: barColor }} />
                              {category === "Other" ? "其他 / 跨領域反思" : category}
                            </span>
                            <span className="text-slate-500 font-mono">
                              {count} 筆想法 ({percentage}%)
                            </span>
                          </div>
                          {/* Bar */}
                          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden relative shadow-inner">
                            <div 
                              className="h-full rounded-full transition-all duration-700 ease-out" 
                              style={{ 
                                width: `${totalAnswersCount > 0 ? (count / totalAnswersCount) * 100 : 0}%`,
                                backgroundColor: barColor
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {totalAnswersCount > 0 && focusedAnswers.some(a => a.category === "Pending") && (
                      <div className="text-[10px] text-slate-400 text-center italic pt-1">
                        * 圖表中尚有 {focusedAnswers.filter(a => a.category === "Pending").length} 筆待分類想法。請點選上方「一鍵 AI 智慧分類」對齊分佈！
                      </div>
                    )}
                  </div>
                ) : (
                  /* Dynamic word cloud component rendering */
                  <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-inner min-h-[220px] flex flex-col justify-between relative overflow-hidden">
                    {/* Background cosmic details */}
                    <div className="absolute top-0 right-0 h-40 w-40 bg-radial from-cyan-600/10 to-transparent blur-xl pointer-events-none" />
                    
                    <div className="text-right text-[10px] text-slate-550 uppercase tracking-widest block font-bold mb-3">
                      💡 現場回覆 Word Cloud 詞頻共識度 (Word Cloud Matrix)
                    </div>

                    {totalAnswersCount > 0 ? (
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3.5 py-4 max-w-2xl mx-auto">
                        {(() => {
                          const cloudTerms = extractWordCloudTerms(focusedAnswers);
                          if (cloudTerms.length === 0) {
                            return (
                              <p className="text-xs text-slate-550">分析加載中... 當學員輸入更豐富的短句，核心詞彙效果更佳哦！</p>
                            );
                          }
                          const maxVal = Math.max(...cloudTerms.map(t => t.value));
                          const minVal = Math.min(...cloudTerms.map(t => t.value));

                          const fontSizes = [11, 13, 15, 18, 22, 26, 30, 34];
                          const rotations = ["rotate-0", "rotate-1", "-rotate-1", "rotate-2", "-rotate-2", "rotate-0", "rotate-0"];

                          return cloudTerms.map((term, index) => {
                            const scale = maxVal === minVal ? 0.3 : (term.value - minVal) / (maxVal - minVal);
                            const sizeIdx = Math.min(Math.floor(scale * (fontSizes.length - 1)), fontSizes.length - 1);
                            const fontSize = fontSizes[sizeIdx];
                            const rot = rotations[index % rotations.length];
                            const color = flatColors[index % flatColors.length];

                            return (
                              <span
                                key={term.text}
                                onClick={() => setSelectedTerm(selectedTerm === term.text ? null : term.text)}
                                style={{ 
                                  fontSize: `${fontSize}px`, 
                                  color: selectedTerm === term.text ? "#ffffff" : color 
                                }}
                                className={`inline-flex items-center font-extrabold transition-all duration-300 cursor-pointer m-1 select-none ${rot} ${
                                  selectedTerm === term.text
                                    ? "bg-black text-white px-3.5 py-1.5 rounded-full scale-110 shadow-lg border border-cyan-400 opacity-100"
                                    : (selectedTerm && selectedTerm !== term.text)
                                      ? "opacity-20 scale-90"
                                      : "opacity-90 hover:opacity-100 hover:scale-110"
                                }`}
                                title={`提及數量: ${term.value}次`}
                              >
                                {term.text}
                                <span className={`text-[8px] font-mono ml-0.5 font-normal ${selectedTerm === term.text ? "text-cyan-300 font-extrabold" : "opacity-25"}`}>
                                  ({term.value})
                                </span>
                              </span>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
                        <p className="text-xs">目前尚未有想法可解析為 Word Cloud</p>
                        <p className="text-[10px] text-slate-500">學員送出想法後，臨床高頻核心字體即時投影在這裡！</p>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-slate-850 text-[9px] text-slate-500 text-center leading-normal">
                      ☁️ 中文自然語意切詞：自動過濾虛詞(的、了、是、在、我們)，大字呈現高頻實詞共識。
                    </div>
                  </div>
                )}
              </div>

              {/* REAL-TIME ANSWERS LIST */}
              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-slate-700 text-sm flex items-center gap-1.5 min-w-0">
                    {selectedTerm ? (
                      <span className="text-cyan-900 font-extrabold bg-cyan-50 border border-cyan-150 px-2.5 py-1 rounded-md flex items-center gap-1 text-[10px] truncate animate-fade-in">
                        🔍 篩選 Word Cloud: 「{selectedTerm}」
                      </span>
                    ) : (
                      <span className="truncate">參與者即時想法串流 (Real-time Response Stream)</span>
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
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest animate-pulse shrink-0">
                      ● 連線中 Live
                    </span>
                  )}
                </div>

                <div className="max-h-85 overflow-y-auto space-y-2.5 pr-2">
                  {(() => {
                    const filteredAnswers = selectedTerm 
                      ? focusedAnswers.filter(ans => ans.text.toLowerCase().includes(selectedTerm.toLowerCase()))
                      : focusedAnswers;

                    return filteredAnswers.length > 0 ? (
                      filteredAnswers.map((answer, index) => {
                        const isPending = answer.category === "Pending";
                        const categoryIndex = focusedQuestion.categories.indexOf(answer.category);
                        const badgeColor = isPending ? "#64748b" : (categoryIndex >= 0 ? flatColors[categoryIndex % flatColors.length] : "#57534e");

                        return (
                          <div 
                            key={answer.id} 
                            className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100/80 transition border border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs fade-in"
                          >
                            <div className="space-y-1 flex-1">
                              <p className="text-slate-800 font-medium leading-relaxed">
                                "{answer.text}"
                              </p>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                # 匿名參與者 • {answer.createdAt ? new Date(answer.createdAt.seconds * 1000).toLocaleTimeString("zh-TW") : "剛送出"}
                              </span>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              <span 
                                className="px-2 py-1 rounded-sm text-[10px] font-bold text-white uppercase tracking-wider" 
                                style={{ backgroundColor: badgeColor }}
                              >
                                {answer.category === "Pending" ? "待一鍵分類" : (answer.category === "Other" ? "未歸納類別" : answer.category)}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleDeleteAnswer(answer.id)}
                                className="p-1 px-2 rounded bg-white hover:bg-rose-50 border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer flex items-center gap-1 font-bold text-[10px]"
                                title="刪除此筆想法"
                              >
                                <Trash2 className="h-3 w-3" />
                                刪除
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 bg-slate-50/50 rounded-lg border border-slate-100 text-slate-400 text-xs">
                        {selectedTerm ? `目前沒有符合「${selectedTerm}」篩選的想法。` : "尚未有合適回答。讓學員掃描網頁，立刻提交第一個想法！"}
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
              <h3 className="font-display font-bold text-slate-500">大會工作坊尚未建立任何題目</h3>
              <p className="text-xs text-slate-400 mt-2">請於右方手動新增題目，或點選快速演示生成預設題目架構。</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONFIGS, SYSTEM SETTINGS & SANDBOX */}
        <div className="lg:col-span-4 space-y-6">
          
          {!isAdminUnlocked ? (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200" />
              <div className="mx-auto bg-slate-50 text-slate-500 h-10 w-10 rounded-full flex items-center justify-center">
                <Lock className="h-4.5 w-4.5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-extrabold text-slate-800 text-sm">
                  🔐 講者主控管理端驗證
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal px-2">
                  內含大會看版自訂、題目與類別管理器 (Manager) 及即時測試雙端切換工具。
                </p>
              </div>
              
              <div className="space-y-2 pt-1">
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
                    placeholder="請輸入大會授權管理密碼"
                    className="w-full text-center text-xs rounded-lg border border-slate-300 p-2 pr-9 focus:ring-1 focus:ring-cyan-500 focus:outline-hidden font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                    title={showPassword ? "隱藏密碼" : "顯示密碼"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-[10px] text-rose-600 font-bold">{passwordError}</p>
                )}
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors"
                >
                  解鎖講者控制台
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* STATUS & LOCK CONTROLS */}
              <div className="bg-slate-900 text-slate-200 rounded-xl p-3 px-4 border border-slate-800 flex items-center justify-between shadow-xs">
                <span className="text-[11px] font-bold tracking-tight text-emerald-400 flex items-center gap-1.5">
                  <Unlock className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  講者管理區已成功驗證解鎖
                </span>
                <button
                  type="button"
                  onClick={handleLock}
                  className="text-[10px] bg-slate-800 hover:bg-rose-700 hover:text-white text-slate-300 font-bold px-2.5 py-1 rounded transition border border-slate-700 cursor-pointer"
                >
                  🔒 鎖定
                </button>
              </div>



              {/* DYNAMIC HEADER CONFIGURATOR (上面的標題自行放入) */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
              <h3 className="font-display font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                <Settings className="h-4.5 w-4.5 text-cyan-700" />
                大會看版動態標題自訂
              </h3>
              {user && (
                <button
                  type="button"
                  onClick={() => setShowSettingsForm(!showSettingsForm)}
                  className="text-xs text-cyan-600 hover:text-cyan-800 font-bold hover:underline"
                >
                  {showSettingsForm ? "收合" : "點選編輯"}
                </button>
              )}
            </div>

            {!showSettingsForm ? (
              <div className="space-y-3">
                <div className="bg-slate-50/80 hover:bg-slate-50 transition p-3.5 rounded-lg border border-slate-150 text-xs text-slate-600 space-y-2">
                  {bannerType === "image" && bannerBgUrl ? (
                    <div className="space-y-1.5 font-sans">
                      <div className="relative rounded overflow-hidden border border-slate-200">
                        <img 
                          src={bannerBgUrl} 
                          alt="Current Banner" 
                          referrerPolicy="no-referrer"
                          className="max-h-20 w-full object-cover"
                        />
                      </div>
                      <p className="text-[10px] text-emerald-700 font-extrabold flex items-center gap-1">
                        ● 大會目前使用「自訂客製化設計 Banner」
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="font-extrabold text-slate-800 text-[13px] leading-snug">{headerTitle}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{headerSubtitle}</p>
                      <div className="pt-2 border-t border-slate-150 flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-medium">
                        {sponsor1 && <span className="bg-white px-2 py-0.5 rounded border border-slate-200">🏛️ {sponsor1}</span>}
                        {sponsor2 && <span className="bg-white px-2 py-0.5 rounded border border-slate-200">🩺 {sponsor2}</span>}
                      </div>
                    </>
                  )}
                </div>
                {!user ? (
                  <div className="p-3 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 text-center">
                    <p className="text-[10px] text-slate-400 leading-normal">
                      請先使用右上角登入 Google 講者帳戶，即可即時置換上傳客製化設計 Banner 或修改文字看版細節。
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSettingsForm(true)}
                    className="w-full text-center py-2 border border-dashed border-cyan-300 hover:border-cyan-500 text-cyan-700 hover:text-cyan-800 transition bg-cyan-50/20 hover:bg-cyan-50 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    📝 點選修改大會看版與客製 Banner 上傳
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveSettings} className="space-y-3.5 bg-slate-50/60 p-4 rounded-lg border border-slate-150 text-xs">
                
                {/* BANNER LAYOUT TYPE SELECTOR */}
                <div className="space-y-2 pb-2.5 border-b border-slate-200">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">大會看版呈現模式 (Banner Mode)：</span>
                  <div className="flex gap-2.5 bg-slate-200/50 p-1 rounded-lg border border-slate-200-30 align-middle">
                    <button
                      type="button"
                      onClick={() => setBannerType("default")}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        bannerType === "default"
                          ? "bg-white text-cyan-850 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      🏛️ 系統預設標題文字排版
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerType("image")}
                      className={`flex-1 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        bannerType === "image"
                          ? "bg-white text-cyan-850 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      🖼️ 上傳一整張專屬設計 Banner
                    </button>
                  </div>
                </div>

                {bannerType === "image" ? (
                  <div className="space-y-3 bg-cyan-50/30 p-3 rounded-lg border border-cyan-100/70">
                    <span className="text-[10px] font-bold text-cyan-800 uppercase tracking-wider block">上傳或貼上您的設計 Banner：</span>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-700 block mb-1">【方法一】從您的電腦選擇圖檔：</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 1.2 * 1024 * 1024) {
                                showMessage("⚠️ 圖檔較大，建議小於 1MB 以獲得更佳網頁縮放速度！", "error");
                              }
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result) {
                                  setBannerBgUrl(event.target.result as string);
                                  showMessage("✨ 已讀取您的 Banner 設計！請點選下面「保存變更」同步全場大螢幕。", "success");
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="w-full text-[10px] text-slate-550 file:mr-2 file:py-1 file:px-2 flex file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-cyan-100 file:text-cyan-800 hover:file:bg-cyan-200 cursor-pointer"
                        />
                      </div>

                      <div className="pt-2 border-t border-slate-205">
                        <label className="text-[9px] font-bold text-slate-555 block mb-1">【方法二】或貼上網頁圖片 URL：</label>
                        <input
                          type="url"
                          value={bannerBgUrl}
                          onChange={(e) => setBannerBgUrl(e.target.value)}
                          placeholder="https://example.com/healthcare-banner.png"
                          className="w-full text-xs rounded-md border border-slate-300 p-1.5 focus:ring-1 focus:ring-cyan-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">活動大會主標題 (例如：大會主題名稱)</label>
                      <input
                        type="text"
                        value={headerTitle}
                        onChange={(e) => setHeaderTitle(e.target.value)}
                        placeholder="例如：2026 CBME Taiwan Week"
                        className="w-full text-xs rounded-md border border-slate-300 p-2 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">副標題說明與標識</label>
                      <input
                        type="text"
                        value={headerSubtitle}
                        onChange={(e) => setHeaderSubtitle(e.target.value)}
                        className="w-full text-xs rounded-md border border-slate-300 p-2 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                        required
                      />
                    </div>

                    <div className="space-y-2 pt-1 border-t border-slate-250">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">協辦及指導單位 A：</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">單位名稱</label>
                          <input
                            type="text"
                            value={sponsor1}
                            onChange={(e) => setSponsor1(e.target.value)}
                            placeholder="國泰綜合醫院"
                            className="w-full text-[11px] rounded-md border border-slate-300 p-1.5 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">英稱/小副標</label>
                          <input
                            type="text"
                            value={sponsor1Sub}
                            onChange={(e) => setSponsor1Sub(e.target.value)}
                            placeholder="Cathay General"
                            className="w-full text-[11px] rounded-md border border-slate-300 p-1.5 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">協辦及指導單位 B：</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">單位名稱</label>
                          <input
                            type="text"
                            value={sponsor2}
                            onChange={(e) => setSponsor2(e.target.value)}
                            placeholder="中國醫藥大學附設醫院"
                            className="w-full text-[11px] rounded-md border border-slate-300 p-1.5 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">英稱/小副標</label>
                          <input
                            type="text"
                            value={sponsor2Sub}
                            onChange={(e) => setSponsor2Sub(e.target.value)}
                            placeholder="CMUH"
                            className="w-full text-[11px] rounded-md border border-slate-300 p-1.5 focus:ring-1 focus:ring-cyan-500 bg-white focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Direct Browser Gemini API Key Configurator */}
                <div className="space-y-2 pt-3.5 border-t border-slate-200">
                  <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block">🧪 智慧歸納 AI 服務設定：</span>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                      Gemini API Key (瀏覽器端直接解析金鑰，選填)
                    </label>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => {
                        setGeminiApiKey(e.target.value);
                        localStorage.setItem("cbme_gemini_api_key", e.target.value);
                      }}
                      placeholder="AIzaSy... (若使用 GitHub Pages 靜態託管，填入此金鑰可直接解析)"
                      className="w-full text-xs rounded-md border border-slate-300 p-2 focus:ring-1 focus:ring-indigo-500 bg-white focus:outline-hidden"
                    />
                    <p className="text-[10px] text-slate-400 leading-normal">
                      ℹ️ 當網頁架設於 GitHub Pages 靜態網站時，後端的 API 會無法運行。此時您可以在此填入您個人的 <b>Gemini API KEY</b>。系統會將此金鑰安全地存放在您本地瀏覽器快取中（儲存於您的本機不經由任何第三方伺服器），使瀏覽器能夠直接對 Google Gemini 發出回應分析，進而完成一鍵智慧歸類。
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowSettingsForm(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-600 font-bold text-white rounded transition disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "儲存中..." : "儲存設定"}
                  </button>
                </div>
              </form>
            )}
          </div>

          </div> ) /* closing tag for unlocked admin workspace wrapping */}

        </div>

      </div>
    </div>
  );
}
