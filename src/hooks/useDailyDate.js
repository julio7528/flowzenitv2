import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

export function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return toDateKey(date) === value ? date : null
}

export function useDailyDate() {
  const [today, setToday] = useState(() => new Date())
  const [params, setParams] = useSearchParams()
  const requestedDate = params.get('data')
  const selectedDate = useMemo(() => parseDate(requestedDate) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate()), [requestedDate, today])
  const selectedDateKey = toDateKey(selectedDate)
  const isToday = selectedDateKey === toDateKey(today)

  useEffect(() => {
    const nextMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const timer = setTimeout(() => setToday(new Date()), nextMidnight.getTime() - Date.now() + 50)
    return () => clearTimeout(timer)
  }, [today])

  function changeDate(amount) {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + amount)
    const nextParams = new URLSearchParams(params)
    if (toDateKey(next) === toDateKey(new Date())) nextParams.delete('data')
    else nextParams.set('data', toDateKey(next))
    setParams(nextParams)
  }

  function goToday() {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('data')
    setParams(nextParams)
  }

  return { selectedDate, selectedDateKey, isToday, changeDate, goToday }
}
