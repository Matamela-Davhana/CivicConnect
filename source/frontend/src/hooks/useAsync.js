import { useCallback, useEffect, useEffectEvent, useState } from 'react'

const EMPTY = { key: null, data: null, error: null }

/**
 * Runs `load(signal)` whenever `key` changes and returns
 * { status: 'loading' | 'error' | 'success', data, error, reload, refresh }.
 * - reload(): back to the loading state, then fetch again (used by "Try again").
 * - refresh(): fetch again but keep showing the current data (used after an action).
 */
export function useAsync(load, key) {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState(EMPTY)
  const run = useEffectEvent(load)

  useEffect(() => {
    const controller = new AbortController()
    run(controller.signal).then(
      (data) => setResult({ key, data, error: null }),
      (error) => {
        if (error?.name !== 'AbortError') setResult({ key, data: null, error })
      },
    )
    return () => controller.abort()
  }, [key, tick])

  const reload = useCallback(() => {
    setResult(EMPTY)
    setTick((value) => value + 1)
  }, [])
  const refresh = useCallback(() => setTick((value) => value + 1), [])

  const settled = result.key === key
  return {
    status: !settled ? 'loading' : result.error ? 'error' : 'success',
    data: settled ? result.data : null,
    error: settled ? result.error : null,
    reload,
    refresh,
  }
}
