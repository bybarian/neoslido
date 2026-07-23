export interface Question {
  id: string;
  title: string;
  createdAt: any; // Firestore Timestamp style
  isActive: boolean;
  categories: string[];
  imageUrl?: string | null;
  type?: 'opentext' | 'wordcloud' | 'poll'; // 'opentext' / 'wordcloud' (text answer) or 'poll' (single choice vote)
  displayMode?: 'list' | 'wordcloud'; // Default display mode for open text questions ('list' for line-by-line or 'wordcloud')
  options?: string[]; // Options for poll mode
}

export interface AnswerReactions {
  like?: number;   // 👍 讚
  heart?: number;  // ❤️ 愛心
  smile?: number;  // 😄 笑臉
}

export interface Answer {
  id: string;
  text: string;
  category: string;
  createdAt: any; // Firestore Timestamp style
  userId: string;
  userName?: string;
  userTitle?: string;
  userHospital?: string;
  likes?: number;
  likedBy?: string[];
  reactions?: AnswerReactions;
}

export interface TypingUser {
  id: string;
  updatedAt: any;
  userName?: string;
}

export interface CategorySummary {
  name: string;
  count: number;
  color: string;
}

export interface WorkshopSettings {
  title: string;
  subtitle: string;
  sponsor1Name: string;
  sponsor1Sub: string;
  sponsor2Name: string;
  sponsor2Sub: string;
  bannerType?: 'default' | 'image';
  bannerBgUrl?: string;
}
