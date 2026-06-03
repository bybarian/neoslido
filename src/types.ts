export interface Question {
  id: string;
  title: string;
  createdAt: any; // Firestore Timestamp style
  isActive: boolean;
  categories: string[];
  imageUrl?: string | null;
}

export interface Answer {
  id: string;
  text: string;
  category: string;
  createdAt: any; // Firestore Timestamp style
  userId: string;
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
