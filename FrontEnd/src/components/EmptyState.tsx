// src/components/EmptyState.tsx
export default function EmptyState({ title="Nothing here yet", note }: {title?:string; note?:string}){
  return (
    <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
      <div className="text-lg font-medium">{title}</div>
      {note && <div className="mt-1 text-sm opacity-70">{note}</div>}
    </div>
  );
}
