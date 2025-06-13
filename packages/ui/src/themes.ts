/** Vordefinierte Themes - Werte aus dem Detailplan. */

export interface Theme {
  id: string;
  label: string;
  /** CSS-Wert (Farbe oder Gradient) für eigene Bubbles. */
  ownBubble: string;
  ownText: string;
  otherBubble: string;
  otherText: string;
  background: string;
  /** Bubble-Randradius in px. */
  radius: number;
  /** true → dunkles Theme (beeinflusst Meta-Textfarben). */
  dark?: boolean;
  /** Minimal-Modus: keine Bubbles, nur ausgerichteter Text. */
  minimal?: boolean;
}

export const THEMES: Theme[] = [
  { id: 'whatsapp', label: 'WhatsApp', ownBubble: '#25D366', ownText: '#0b3d1f', otherBubble: '#FFFFFF', otherText: '#111111', background: '#E5DDD5', radius: 12 },
  { id: 'bumblebee', label: 'Bumblebee', ownBubble: '#e6b400', ownText: '#1a1a1a', otherBubble: '#23262e', otherText: '#eceef2', background: '#101216', radius: 12, dark: true },
  { id: 'imessage', label: 'iMessage', ownBubble: '#007AFF', ownText: '#FFFFFF', otherBubble: '#E9E9EB', otherText: '#111111', background: '#FFFFFF', radius: 18 },
  { id: 'imessage-dark', label: 'iMessage Dark', ownBubble: '#0B84FF', ownText: '#FFFFFF', otherBubble: '#3A3A3C', otherText: '#F2F2F7', background: '#000000', radius: 18, dark: true },
  { id: 'telegram', label: 'Telegram', ownBubble: 'linear-gradient(135deg, #4ea4f6 0%, #2a7cd4 100%)', ownText: '#FFFFFF', otherBubble: '#FFFFFF', otherText: '#111111', background: '#DCDDE1', radius: 14 },
  { id: 'signal', label: 'Signal', ownBubble: '#2C6BED', ownText: '#FFFFFF', otherBubble: '#FFFFFF', otherText: '#111111', background: '#F6F6F6', radius: 16 },
  { id: 'slack', label: 'Slack', ownBubble: '#4A154B', ownText: '#FFFFFF', otherBubble: '#F2F2F2', otherText: '#111111', background: '#FFFFFF', radius: 8 },
  { id: 'teams', label: 'Microsoft Teams', ownBubble: '#6264A7', ownText: '#FFFFFF', otherBubble: '#F0F0F0', otherText: '#111111', background: '#FFFFFF', radius: 8 },
  { id: 'discord', label: 'Discord', ownBubble: '#5865F2', ownText: '#FFFFFF', otherBubble: '#40444B', otherText: '#DCDDDE', background: '#36393F', radius: 10, dark: true },
  { id: 'android', label: 'Android Messages', ownBubble: '#1A73E8', ownText: '#FFFFFF', otherBubble: '#F1F3F4', otherText: '#111111', background: '#FFFFFF', radius: 18 },
  { id: 'sms', label: 'SMS Classic', ownBubble: '#007AFF', ownText: '#FFFFFF', otherBubble: '#E5E5EA', otherText: '#111111', background: '#FFFFFF', radius: 14 },
  { id: 'minimal', label: 'Minimal', ownBubble: 'transparent', ownText: 'inherit', otherBubble: 'transparent', otherText: 'inherit', background: 'transparent', radius: 0, minimal: true },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? (THEMES[0] as Theme);
}
