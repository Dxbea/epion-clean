import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE } from '@/config/api';
import PageContainer from '@/components/ui/PageContainer';
import { Button } from '@/components/ui';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage("Lien de vérification invalide ou manquant.");
      return;
    }

    axios
      .get(`${API_BASE}/api/auth/verify-email?token=${token}`, {
        withCredentials: true,
      })
      .then(() => {
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(
          err.response?.data?.error || 
          err.response?.data?.message || 
          "Impossible de vérifier votre email. Le lien a peut-être expiré."
        );
      });
  }, [token]);

  return (
    <PageContainer className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        
        {status === 'loading' && (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-brand-blue" />
            <h2 className="text-xl font-semibold">Vérification en cours...</h2>
            <p className="text-sm opacity-70">Veuillez patienter pendant la validation de votre lien.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center space-y-4">
            <CheckCircle className="h-14 w-14 text-green-500" />
            <h2 className="text-2xl font-bold text-green-600 dark:text-green-500">
              Email vérifié avec succès !
            </h2>
            <p className="mb-4 text-sm opacity-70">
              Merci, votre adresse email a bien été confirmée. Vous pouvez maintenant fermer cette page ou retourner à l'accueil.
            </p>
            <Button onClick={() => navigate('/settings#account')} variant="primary" className="w-full">
              Continuer vers mon compte
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center space-y-4">
            <XCircle className="h-14 w-14 text-red-500" />
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-500">
              Échec de la vérification
            </h2>
            <div className="mb-4 rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {errorMessage}
            </div>
            <Button onClick={() => navigate('/')} variant="ghost" className="w-full">
              Retour à l'accueil
            </Button>
          </div>
        )}

      </div>
    </PageContainer>
  );
}
