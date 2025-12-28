# RecommendationsPanel Component

A production-ready React component for displaying live AI recommendations during sales calls.

## Features

- **Visual Priority Indicators**: Color-coded borders (red=high, yellow=medium, blue=low)
- **Category Badges**: Icons and labels for different recommendation types
- **Non-intrusive Design**: Slide-in panel that doesn't obstruct the call
- **Dismissible**: Individual dismiss or clear all functionality
- **Collapsible**: Minimize to just the header when not needed
- **Timestamps**: Shows when each recommendation was generated
- **Confidence Scores**: Displays AI confidence percentage
- **Warnings**: Shows warnings like "low transcript confidence"
- **Scrollable**: Handles multiple recommendations with smooth scrolling
- **Responsive**: Adapts to different screen heights

## Usage

### Basic Example

```tsx
import RecommendationsPanel, { RecommendationItem } from './components/RecommendationsPanel';

function MyComponent() {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([
    {
      id: '1',
      type: 'objection_handling',
      title: 'Address price concern',
      script: 'Let me show you the ROI calculator...',
      confidence: 0.92,
      createdAt: Date.now(),
      warnings: []
    }
  ]);

  const handleDismiss = (id: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  const handleDismissAll = () => {
    setRecommendations([]);
  };

  return (
    <RecommendationsPanel
      recommendations={recommendations}
      onDismiss={handleDismiss}
      onDismissAll={handleDismissAll}
    />
  );
}
```

### With SSE Stream Integration

```tsx
import { useEffect, useState } from 'react';
import RecommendationsPanel, { RecommendationItem } from './components/RecommendationsPanel';

function ActiveCallPage({ sessionId }: { sessionId: string }) {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

    eventSource.addEventListener('recommendation', (event) => {
      const data = JSON.parse(event.data);

      // Convert backend format to UI format
      const newRec: RecommendationItem = {
        id: crypto.randomUUID(),
        type: data.type,
        title: data.title,
        script: data.script,
        confidence: data.confidence,
        createdAt: data.createdAt,
        warnings: data.warnings || []
      };

      setRecommendations(prev => [newRec, ...prev].slice(0, 10)); // Keep latest 10
    });

    return () => eventSource.close();
  }, [sessionId]);

  return (
    <RecommendationsPanel
      recommendations={recommendations}
      onDismiss={(id) => setRecommendations(prev => prev.filter(r => r.id !== id))}
      onDismissAll={() => setRecommendations([])}
    />
  );
}
```

## Props

### `RecommendationsPanelProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `recommendations` | `RecommendationItem[]` | Yes | Array of recommendations to display |
| `onDismiss` | `(id: string) => void` | No | Callback when a single recommendation is dismissed |
| `onDismissAll` | `() => void` | No | Callback when all recommendations are dismissed |
| `className` | `string` | No | Additional CSS class names |

### `RecommendationItem`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier for the recommendation |
| `type` | `string` | Backend type (e.g., 'objection_handling', 'next_step') |
| `title` | `string` | Short title summarizing the recommendation |
| `script` | `string` | Suggested talking point or action |
| `confidence` | `number` | AI confidence score (0-1) |
| `createdAt` | `number` | Unix timestamp (milliseconds) |
| `warnings` | `string[]` | Optional warnings to display |

## Recommendation Types

The component supports these recommendation types (automatically categorized):

- **`next_best_response`** → "Answer" (blue)
- **`objection_handling`** → "Objection" (red)
- **`next_step`** → "Next Step" (green)
- **`discovery_question`** → "Discovery" (yellow)
- **`positioning_point`** → "Positioning" (purple)

## Priority Levels

Priority is automatically derived from the confidence score:

- **High** (red): confidence ≥ 0.8
- **Medium** (yellow): confidence ≥ 0.5
- **Low** (blue): confidence < 0.5

## Styling

The component uses a separate CSS file (`RecommendationsPanel.css`) with dark theme styling that matches the existing app design. Key CSS classes:

- `.recommendations-panel` - Main container
- `.recommendation-card` - Individual recommendation
- `.priority-high/medium/low` - Priority styling
- `.category-answer/objection/next-step/discovery/positioning` - Category badges

### Customization

Override styles by targeting specific classes:

```css
.recommendations-panel {
  /* Customize position */
  left: 40px;
  top: 40px;
}

.recommendation-card {
  /* Customize card appearance */
  background: #yourcolor;
}
```

## Accessibility

- Semantic HTML with proper button roles
- Keyboard navigation supported
- Clear visual hierarchy
- Color-coded with text labels (not color-only)
- Focus states on interactive elements

## Performance

- Efficient re-renders with React keys
- CSS animations for smooth transitions
- Minimal DOM updates on dismiss
- Scrollable container for large lists

## Examples

See `RecommendationsPanel.stories.tsx` for comprehensive examples including:
- High priority objection handling
- Medium priority next steps
- Low confidence recommendations with warnings
- Multiple categories displayed together

## Integration Notes

1. **Position**: Positioned on the left side by default. The chat panel is on the right.
2. **Z-index**: Uses `z-index: 100` to stay above background but below modals
3. **Responsive**: Max height adjusts based on viewport height
4. **Collapse**: Users can minimize to just the header to reduce screen clutter
5. **Auto-scroll**: New recommendations appear at the top of the list
