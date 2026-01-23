import React from 'react';
import { Loader2 } from 'lucide-react';

export default function PageLoader() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] w-full p-4">
            <Loader2 className="w-10 h-10 text-brand-primary animate-spin mb-4 opacity-80" />
            <p className="text-sm text-muted-foreground animate-pulse">
                Chargement...
            </p>
        </div>
    );
}
