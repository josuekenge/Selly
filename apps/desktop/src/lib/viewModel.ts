export type SpeakerLabel = "Rep" | "Prospect" | "Unknown";

export interface CallInsightsViewModel {
  title: string;
  dateLabel: string;
  transcriptUtterances: {
    speaker: SpeakerLabel;
    text: string;
    confidence: number;
  }[];
  transcriptText: string;
  bullets: string[];
  recommendations: {
    type: string;
    title: string;
    script: string;
    confidence: number;
    warnings: string[];
  }[];
}

function mapSpeaker(raw: unknown): SpeakerLabel {
  if (typeof raw !== 'string') return 'Unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('rep') || lower.includes('agent') || lower === 'rep') return 'Rep';
  if (lower.includes('prospect') || lower.includes('customer') || lower === 'prospect') return 'Prospect';
  return 'Unknown';
}

export function buildViewModel(raw: unknown): CallInsightsViewModel {
  const vm: CallInsightsViewModel = {
    title: 'Call recap',
    dateLabel: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    transcriptUtterances: [],
    transcriptText: '',
    bullets: [],
    recommendations: []
  };

  try {
    if (!raw || typeof raw !== 'object') return vm;

    const data = raw as any;

    // Extract title
    if (data.summary?.title && typeof data.summary.title === 'string') {
      vm.title = data.summary.title;
    }

    // Extract bullets
    if (Array.isArray(data.summary?.bullets)) {
      vm.bullets = data.summary.bullets
        .filter((b: unknown) => typeof b === 'string')
        .slice(0, 10);
    }

    // Extract transcript utterances
    if (Array.isArray(data.transcript)) {
      const utterances = data.transcript
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as any;
          if (!obj.text || typeof obj.text !== 'string') return null;

          return {
            speaker: mapSpeaker(obj.speaker),
            text: obj.text,
            confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5
          };
        })
        .filter((u: any) => u !== null)
        .slice(0, 200);

      vm.transcriptUtterances = utterances;

      // Build transcriptText
      vm.transcriptText = utterances
        .map((u: any) => `[${u.speaker}] ${u.text}`)
        .join('\n');
    }

    // Extract recommendations
    if (Array.isArray(data.recommendations)) {
      vm.recommendations = data.recommendations
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as any;

          return {
            type: typeof obj.type === 'string' ? obj.type : 'action',
            title: typeof obj.title === 'string' ? obj.title : '',
            script: typeof obj.script === 'string' ? obj.script : '',
            confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
            warnings: []
          };
        })
        .filter((r: any) => r !== null && r.title)
        .slice(0, 5);
    }

  } catch (err) {
    // Never throw, return safe defaults
    console.error('buildViewModel error:', err);
  }

  return vm;
}
