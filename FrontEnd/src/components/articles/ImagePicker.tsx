// FrontEnd/src/components/articles/ImagePicker.tsx
import React from 'react';

type Props = {
  value?: string | null;
  onChange: (url: string | null) => void;
  library: string[];           // pass the curated list for the category
};

export default function ImagePicker({ value, onChange, library }: Props){
  const [mode, setMode] = React.useState<'library'|'url'>('library');
  const [url, setUrl] = React.useState(value || '');

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button
          className={`rounded-full border px-3 py-1 ${mode==='library'?'bg-black text-white dark:bg-white dark:text-black':''}`}
          onClick={()=>setMode('library')}
        >
          Choose from library
        </button>
        <button
          className={`rounded-full border px-3 py-1 ${mode==='url'?'bg-black text-white dark:bg-white dark:text-black':''}`}
          onClick={()=>setMode('url')}
        >
          Use a URL
        </button>
      </div>

      {mode === 'url' ? (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2 dark:border-white/10"
            placeholder="https://…"
            value={url}
            onChange={(e)=>setUrl(e.target.value)}
          />
          <button className="rounded-lg border px-3 py-2" onClick={()=>onChange(url || null)}>
            Apply
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {library.map((u) => (
            <button
              key={u}
              className={`overflow-hidden rounded-xl border ${value===u?'ring-2 ring-blue-500':''}`}
              onClick={()=>onChange(u)}
              title="Select"
            >
              <img src={u} alt="" className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
