// src/lib/useMediaQuery.ts
import { useEffect, useState } from 'react'

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (!('matchMedia' in window)) return
    const mql = window.matchMedia(query)

    const onChange = () => setMatches(mql.matches)
    onChange()

    // Safari互換
    if ('addEventListener' in mql) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    } else {
      // @ts-ignore
      mql.addListener(onChange)
      // @ts-ignore
      return () => mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
