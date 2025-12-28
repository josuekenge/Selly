import { useState } from 'react';
import { X, AlertCircle, Lightbulb, MessageCircle, TrendingUp, CheckCircle } from 'lucide-react';
import './RecommendationsPanel.css';

/**
 * Priority derived from confidence score
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

/**
 * UI-friendly category names
 */
export type RecommendationCategory =
  | 'answer'
  | 'objection'
  | 'next-step'
  | 'discovery'
  | 'positioning';

/**
 * Single recommendation item to display
 */
export interface RecommendationItem {
  id: string;
  type: string;
  title: string;
  script: string;
  confidence: number;
  createdAt: number;
  warnings?: string[];
}

/**
 * Props for the RecommendationsPanel component
 */
export interface RecommendationsPanelProps {
  recommendations: RecommendationItem[];
  onDismiss?: (id: string) => void;
  onDismissAll?: () => void;
  className?: string;
}

/**
 * Maps backend recommendation type to UI category
 */
function mapTypeToCategory(type: string): RecommendationCategory {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('response') || lowerType === 'next_best_response') return 'answer';
  if (lowerType.includes('objection')) return 'objection';
  if (lowerType.includes('next_step') || lowerType === 'next_step') return 'next-step';
  if (lowerType.includes('discovery') || lowerType.includes('question')) return 'discovery';
  if (lowerType.includes('positioning')) return 'positioning';
  return 'answer';
}

/**
 * Derives priority from confidence score
 */
function getPriority(confidence: number): RecommendationPriority {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Returns icon component for category
 */
function getCategoryIcon(category: RecommendationCategory) {
  switch (category) {
    case 'answer':
      return <MessageCircle size={14} />;
    case 'objection':
      return <AlertCircle size={14} />;
    case 'next-step':
      return <TrendingUp size={14} />;
    case 'discovery':
      return <Lightbulb size={14} />;
    case 'positioning':
      return <CheckCircle size={14} />;
    default:
      return <MessageCircle size={14} />;
  }
}

/**
 * Returns display label for category
 */
function getCategoryLabel(category: RecommendationCategory): string {
  switch (category) {
    case 'answer':
      return 'Answer';
    case 'objection':
      return 'Objection';
    case 'next-step':
      return 'Next Step';
    case 'discovery':
      return 'Discovery';
    case 'positioning':
      return 'Positioning';
    default:
      return 'Suggestion';
  }
}

/**
 * Formats timestamp to relative time (e.g., "2m ago")
 */
function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return 'Earlier';
}

/**
 * RecommendationsPanel - Displays live AI recommendations during calls
 *
 * Features:
 * - Shows recommendations with title, script, priority, category
 * - Non-intrusive slide-in panel design
 * - Individual dismiss or dismiss all
 * - Color-coded priority indicators
 * - Category badges with icons
 * - Timestamps showing recency
 * - Scrollable list for multiple recommendations
 * - Warning indicators when present
 */
export default function RecommendationsPanel({
  recommendations,
  onDismiss,
  onDismissAll,
  className = ''
}: RecommendationsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (recommendations.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    onDismiss?.(id);
  };

  const handleDismissAll = () => {
    onDismissAll?.();
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <div className={`recommendations-panel ${collapsed ? 'collapsed' : ''} ${className}`}>
      <div className="recommendations-header">
        <div className="recommendations-header-left">
          <Lightbulb size={16} className="recommendations-icon" />
          <span className="recommendations-title">Recommendations</span>
          <span className="recommendations-count">{recommendations.length}</span>
        </div>
        <div className="recommendations-header-actions">
          {recommendations.length > 1 && !collapsed && (
            <button
              className="recommendations-dismiss-all"
              onClick={handleDismissAll}
              title="Dismiss all"
            >
              Clear all
            </button>
          )}
          <button
            className="recommendations-collapse-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="recommendations-list">
          {recommendations.map((rec) => {
            const category = mapTypeToCategory(rec.type);
            const priority = getPriority(rec.confidence);
            const categoryIcon = getCategoryIcon(category);
            const categoryLabel = getCategoryLabel(category);
            const timestamp = formatTimestamp(rec.createdAt);
            const hasWarnings = rec.warnings && rec.warnings.length > 0;

            return (
              <div
                key={rec.id}
                className={`recommendation-card priority-${priority}`}
              >
                <div className="recommendation-header-row">
                  <div className="recommendation-badges">
                    <span className={`category-badge category-${category}`}>
                      {categoryIcon}
                      <span>{categoryLabel}</span>
                    </span>
                    <span className={`priority-badge priority-${priority}`}>
                      {priority}
                    </span>
                  </div>
                  <button
                    className="recommendation-dismiss"
                    onClick={() => handleDismiss(rec.id)}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>

                <h3 className="recommendation-title">{rec.title}</h3>

                <div className="recommendation-script">
                  {rec.script}
                </div>

                {hasWarnings && (
                  <div className="recommendation-warnings">
                    {rec.warnings!.map((warning, idx) => (
                      <div key={idx} className="warning-item">
                        <AlertCircle size={12} />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="recommendation-footer">
                  <span className="recommendation-timestamp">{timestamp}</span>
                  <span className="recommendation-confidence">
                    {Math.round(rec.confidence * 100)}% confident
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
