import { DICT } from "@/i18n/dict";

function compareKeys(objA: Record<string,string>, objB: Record<string,string>, nameA: string, nameB: string) {
  const keysA = new Set(Object.keys(objA))
  const keysB = new Set(Object.keys(objB))

  const missingInB = [...keysA].filter(k => !keysB.has(k))
  const missingInA = [...keysB].filter(k => !keysA.has(k))

  if (missingInB.length) {
    console.warn(`⚠️  Keys in ${nameA} but missing in ${nameB}:`, missingInB)
  }
  if (missingInA.length) {
    console.warn(`⚠️  Keys in ${nameB} but missing in ${nameA}:`, missingInA)
  }

  if (!missingInA.length && !missingInB.length) {
    console.log(`✅ ${nameA} and ${nameB} have the same keys.`)
  }
}

compareKeys(DICT.en, DICT.fr, "en", "fr")
