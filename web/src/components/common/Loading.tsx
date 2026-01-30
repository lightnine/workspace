import React from 'react';
import { Box, CircularProgress } from '@mui/material';

interface LoadingProps {
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({ fullScreen = false }) => {
  const containerStyle = fullScreen
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    : {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4
      };

  return (
    <Box sx={containerStyle}>
      <CircularProgress />
    </Box>
  );
};
