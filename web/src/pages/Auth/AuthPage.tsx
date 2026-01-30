import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Tab,
  Tabs,
  Alert,
  CircularProgress
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { register as registerApi } from '../../services/auth';
import { setAccessToken, setRefreshToken } from '../../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const AuthPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, setUser } = useApp();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email: loginEmail, password: loginPassword });
    } catch (err: any) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const authData = await registerApi({
        username: registerUsername,
        email: registerEmail,
        password: registerPassword,
        display_name: registerDisplayName || undefined
      });
      setAccessToken(authData.access_token);
      setRefreshToken(authData.refresh_token);
      setUser(authData.user);
    } catch (err: any) {
      setError(err.message || t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2
      }}
    >
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #0B5FFF 0%, #7C3AED 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.2rem',
                mr: 1.5
              }}
            >
              DW
            </Box>
            <Typography variant="h5" fontWeight={600}>
              Workspace
            </Typography>
          </Box>

          {/* Tabs */}
          <Tabs value={tabValue} onChange={handleTabChange} centered sx={{ mb: 2 }}>
            <Tab label={t('auth.login')} />
            <Tab label={t('auth.register')} />
          </Tabs>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <TabPanel value={tabValue} index={0}>
            <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label={t('auth.email')}
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                margin="normal"
                required
                autoFocus
              />
              <TextField
                fullWidth
                label={t('auth.password')}
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                margin="normal"
                required
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3 }}
              >
                {loading ? <CircularProgress size={24} /> : t('auth.login')}
              </Button>
            </form>
          </TabPanel>

          {/* Register Form */}
          <TabPanel value={tabValue} index={1}>
            <form onSubmit={handleRegister}>
              <TextField
                fullWidth
                label={t('auth.username')}
                value={registerUsername}
                onChange={(e) => setRegisterUsername(e.target.value)}
                margin="normal"
                required
                autoFocus
                inputProps={{ minLength: 3, maxLength: 50 }}
              />
              <TextField
                fullWidth
                label={t('auth.email')}
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label={t('auth.displayName')}
                value={registerDisplayName}
                onChange={(e) => setRegisterDisplayName(e.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label={t('auth.password')}
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                margin="normal"
                required
                inputProps={{ minLength: 8 }}
                helperText={t('auth.passwordHint')}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3 }}
              >
                {loading ? <CircularProgress size={24} /> : t('auth.register')}
              </Button>
            </form>
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
};
