import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  open: boolean;
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ type, message, open, onClose }) => {
  if (!open) return null;

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-destructive" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/20',
    error: 'bg-destructive/10 border-destructive/20',
    warning: 'bg-yellow-500/10 border-yellow-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-right-full duration-300">
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg bg-background',
        bgColors[type]
      )}>
        {icons[type]}
        <span className="text-sm font-medium">{message}</span>
        <button 
          onClick={onClose}
          className="ml-2 p-1 rounded hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
