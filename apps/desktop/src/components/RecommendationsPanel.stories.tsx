/**
 * Example usage and test cases for RecommendationsPanel
 * This file demonstrates various recommendation scenarios
 */

import RecommendationsPanel, { RecommendationItem } from './RecommendationsPanel';

// Example: High priority objection handling
export const highPriorityObjection: RecommendationItem = {
  id: 'obj-1',
  type: 'objection_handling',
  title: 'Price concern detected',
  script: 'I understand budget is important. Let me show you the ROI calculator - most customers see a 3x return within 6 months through time savings alone.',
  confidence: 0.95,
  createdAt: Date.now() - 15000,
  warnings: []
};

// Example: Medium priority next step
export const mediumPriorityNextStep: RecommendationItem = {
  id: 'next-1',
  type: 'next_step',
  title: 'Schedule technical deep-dive',
  script: 'Based on their questions about integrations, suggest scheduling a 30-minute technical call with our solutions engineer.',
  confidence: 0.68,
  createdAt: Date.now() - 45000,
  warnings: []
};

// Example: Discovery question with low confidence
export const lowPriorityDiscovery: RecommendationItem = {
  id: 'disc-1',
  type: 'discovery_question',
  title: 'Explore team size',
  script: 'How many people are on your sales team currently? This will help me recommend the right plan tier.',
  confidence: 0.42,
  createdAt: Date.now() - 120000,
  warnings: ['Low transcript confidence']
};

// Example: Positioning point
export const positioningPoint: RecommendationItem = {
  id: 'pos-1',
  type: 'positioning_point',
  title: 'Highlight competitive advantage',
  script: 'Unlike other CRMs that require manual data entry, our system automatically captures all interactions and enriches your data in real-time.',
  confidence: 0.85,
  createdAt: Date.now() - 30000,
  warnings: []
};

// Example: Next best response
export const nextBestResponse: RecommendationItem = {
  id: 'resp-1',
  type: 'next_best_response',
  title: 'Address integration concerns',
  script: 'We have native integrations with Salesforce, HubSpot, and 200+ other tools. Our API also supports custom integrations if you have specific needs.',
  confidence: 0.88,
  createdAt: Date.now() - 60000,
  warnings: []
};

// Example: Multiple recommendations with warnings
export const exampleRecommendations: RecommendationItem[] = [
  highPriorityObjection,
  nextBestResponse,
  mediumPriorityNextStep,
  positioningPoint,
  lowPriorityDiscovery
];

// Example usage in a component:
export function RecommendationsPanelExample() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#f9fafe' }}>
      <RecommendationsPanel
        recommendations={exampleRecommendations}
        onDismiss={(id) => console.log('Dismissed:', id)}
        onDismissAll={() => console.log('Dismissed all')}
      />
    </div>
  );
}
