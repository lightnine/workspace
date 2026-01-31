import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Loading: React.FC<LoadingProps> = ({ 
  fullScreen = false, 
  size = 'md',
  className 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
        <Loader2 className={cn('animate-spin text-primary', sizeClasses[size], className)} />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center p-4', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
    </div>
  );
};
