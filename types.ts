export enum Speaker {
  User = 'User',
  Coach = 'Coach',
}

export interface Message {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: number;
}

export interface SessionState {
  isActive: boolean;
  isProcessing: boolean;
  isSpeaking: boolean; // Coach is speaking
}

export enum CoachMood {
  Neutral = 'Neutral',
  Critical = 'Critical',
  Approving = 'Approving',
  Listening = 'Listening',
}