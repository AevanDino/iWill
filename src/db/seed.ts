import type { Category, RoutineTemplate } from '../types'

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'focus', name: 'Deep Work', color: '#b69cff', emoji: '🧠', order: 0 },
  { id: 'meeting', name: 'Meeting', color: '#4d96ff', emoji: '🗣️', order: 1 },
  { id: 'admin', name: 'Admin', color: '#ffd23f', emoji: '📥', order: 2 },
  { id: 'break', name: 'Break', color: '#3ddc97', emoji: '☕', order: 3 },
  { id: 'move', name: 'Exercise', color: '#ff8a3d', emoji: '🏃', order: 4 },
  { id: 'life', name: 'Personal', color: '#ff5d8f', emoji: '🏡', order: 5 },
]

export const DEFAULT_ROUTINES: RoutineTemplate[] = [
  {
    id: 'morning-kickoff',
    name: 'Morning Kickoff',
    emoji: '🌅',
    steps: [
      { title: 'Plan the day', categoryId: 'admin', duration: 15 },
      { title: 'Inbox zero', categoryId: 'admin', duration: 15 },
      { title: 'Standup', categoryId: 'meeting', duration: 15 },
    ],
  },
  {
    id: 'deep-sprint',
    name: 'Deep Work Sprint',
    emoji: '🚀',
    steps: [
      { title: 'Focus block', categoryId: 'focus', duration: 45 },
      { title: 'Stretch', categoryId: 'break', duration: 15 },
      { title: 'Focus block', categoryId: 'focus', duration: 45 },
    ],
  },
  {
    id: 'wind-down',
    name: 'Wind Down',
    emoji: '🌙',
    steps: [
      { title: 'Review & tomorrow', categoryId: 'admin', duration: 15 },
      { title: 'Walk', categoryId: 'move', duration: 30 },
    ],
  },
]
