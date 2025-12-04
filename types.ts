export enum AppMode {
  SETUP = 'SETUP',
  WIDGET = 'WIDGET',
}

export interface BusinessConfig {
  businessName: string;
  tradeType: string;
  contactName: string;
  services: string;
  availability: string;
  pricing: string;
  knowledgeBaseText?: string;
  sitemapUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
  sources?: { title: string; uri: string }[];
}

export interface AudioFrequencyData {
  values: number[];
}