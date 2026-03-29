import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

export function parseJsonSafe<T>(text: string): T | null {
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshteinDistance(first: string, second: string): number {
  if (first === second) return 0
  if (!first.length) return second.length
  if (!second.length) return first.length

  const matrix = Array.from({ length: first.length + 1 }, () => new Array(second.length + 1).fill(0))

  for (let row = 0; row <= first.length; row += 1) matrix[row][0] = row
  for (let col = 0; col <= second.length; col += 1) matrix[0][col] = col

  for (let row = 1; row <= first.length; row += 1) {
    for (let col = 1; col <= second.length; col += 1) {
      const cost = first[row - 1] === second[col - 1] ? 0 : 1
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      )
    }
  }

  return matrix[first.length][second.length]
}
