interface RecorderPillProps {
  onStop: () => void;
}

export default function RecorderPill({ onStop }: RecorderPillProps) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 rounded-full px-6 py-3 flex items-center gap-4 shadow-lg border border-gray-700">
      <div className="flex items-center gap-1">
        <div className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: '12px', animationDuration: '1s' }}></div>
        <div className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: '20px', animationDuration: '1.2s', animationDelay: '0.1s' }}></div>
        <div className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: '16px', animationDuration: '0.9s', animationDelay: '0.2s' }}></div>
        <div className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: '24px', animationDuration: '1.1s', animationDelay: '0.15s' }}></div>
        <div className="w-1 bg-red-500 rounded-full animate-pulse" style={{ height: '14px', animationDuration: '1s', animationDelay: '0.25s' }}></div>
      </div>
      <button
        onClick={onStop}
        className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded-full text-sm font-medium transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
