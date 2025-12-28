// ErrorAlert Component
// Displays user-friendly error messages with appropriate icons and actions

interface ErrorAlertProps {
    title?: string;
    message: string;
    onRetry?: () => void;
    onDismiss?: () => void;
    variant?: 'error' | 'warning' | 'info';
}

/**
 * Parse technical error message into user-friendly text
 */
function parseErrorMessage(error: string): {
    title: string;
    message: string;
    suggestion?: string;
} {
    const lower = error.toLowerCase();

    // Agent connection issues
    if (lower.includes('agentstart') || lower.includes('agent') && lower.includes('fail')) {
        return {
            title: 'Recording Service Unavailable',
            message: 'Could not connect to the local recording agent.',
            suggestion: 'Make sure the Selly agent is running on your computer.',
        };
    }

    // Backend connection issues
    if (lower.includes('startcall') || lower.includes('fetch') || lower.includes('network')) {
        return {
            title: 'Server Connection Failed',
            message: 'Could not connect to the Selly backend server.',
            suggestion: 'Check your internet connection and try again.',
        };
    }

    // Upload issues
    if (lower.includes('upload') || lower.includes('sign')) {
        return {
            title: 'Upload Failed',
            message: 'Could not upload the recording to cloud storage.',
            suggestion: 'Check your internet connection and try again.',
        };
    }

    // Processing issues
    if (lower.includes('process') || lower.includes('transcri')) {
        return {
            title: 'Processing Failed',
            message: 'There was an error processing your recording.',
            suggestion: 'Your recording was saved but processing failed. Try again later.',
        };
    }

    // Audio issues
    if (lower.includes('audio') || lower.includes('mic') || lower.includes('capture')) {
        return {
            title: 'Audio Error',
            message: 'There was a problem with audio capture.',
            suggestion: 'Check that your microphone is connected and permissions are granted.',
        };
    }

    // Supabase/storage issues
    if (lower.includes('supabase') || lower.includes('storage')) {
        return {
            title: 'Storage Error',
            message: 'Cloud storage is temporarily unavailable.',
            suggestion: 'Try again in a few moments.',
        };
    }

    // OpenAI/AI issues
    if (lower.includes('openai') || lower.includes('recommendation')) {
        return {
            title: 'AI Service Unavailable',
            message: 'The AI recommendation service is temporarily unavailable.',
            suggestion: 'Your call will still be recorded without real-time suggestions.',
        };
    }

    // Default fallback
    return {
        title: 'Something Went Wrong',
        message: error,
        suggestion: 'Try resetting and starting again.',
    };
}

export default function ErrorAlert({
    title,
    message,
    onRetry,
    onDismiss,
    variant = 'error',
}: ErrorAlertProps) {
    const parsed = title ? { title, message, suggestion: undefined } : parseErrorMessage(message);

    const bgColor = variant === 'error' ? 'bg-red-900/50' :
        variant === 'warning' ? 'bg-yellow-900/50' : 'bg-blue-900/50';
    const borderColor = variant === 'error' ? 'border-red-700' :
        variant === 'warning' ? 'border-yellow-700' : 'border-blue-700';
    const iconColor = variant === 'error' ? 'text-red-400' :
        variant === 'warning' ? 'text-yellow-400' : 'text-blue-400';

    return (
        <div className={`${bgColor} ${borderColor} border rounded-lg p-6 max-w-md mx-auto`}>
            <div className="flex items-start">
                <span className={`text-2xl mr-3 ${iconColor}`}>
                    {variant === 'error' ? '⚠️' : variant === 'warning' ? '⚡' : 'ℹ️'}
                </span>
                <div className="flex-1">
                    <h3 className="font-semibold text-lg text-white mb-1">
                        {parsed.title}
                    </h3>
                    <p className="text-gray-300 text-sm mb-2">
                        {parsed.message}
                    </p>
                    {parsed.suggestion && (
                        <p className="text-gray-400 text-xs">
                            💡 {parsed.suggestion}
                        </p>
                    )}
                </div>
            </div>

            {(onRetry || onDismiss) && (
                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-700">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Try Again
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// Connection status indicator component
interface ConnectionStatusProps {
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    label?: string;
}

export function ConnectionStatus({ status, label = 'AI' }: ConnectionStatusProps) {
    const statusColors = {
        connecting: 'bg-yellow-500',
        connected: 'bg-green-500',
        disconnected: 'bg-gray-500',
        error: 'bg-red-500',
    };

    const statusText = {
        connecting: 'Connecting...',
        connected: 'Connected',
        disconnected: 'Offline',
        error: 'Error',
    };

    return (
        <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${statusColors[status]} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
            <span>{label}: {statusText[status]}</span>
        </div>
    );
}
