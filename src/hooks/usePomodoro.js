import { useContext } from 'react'
import { PomodoroContext } from '../context/PomodoroContext.js'

export function usePomodoro() {
  const value = useContext(PomodoroContext)
  if (!value) throw new Error('usePomodoro precisa ser usado dentro de PomodoroProvider.')
  return value
}
