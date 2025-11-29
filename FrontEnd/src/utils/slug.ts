export function slugify(s: string){
  return s.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\w-]/g,'');
}

export function isCategorySlug(slug: string, categories: string[]){
  const s = slug.toLowerCase();
  return categories.some(c =>
    c.toLowerCase() === s ||
    slugify(c) === s
  );
}
