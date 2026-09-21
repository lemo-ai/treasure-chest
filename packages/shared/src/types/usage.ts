/** Token usage snapshot types (0.6.0). */

export interface UsageDayBucket {
  day: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
  estimatedCalls: number
}

export interface UsageSessionBucket {
  sessionId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
  updatedAt: string
}

export interface UsagePricing {
  promptPerMillion: number
  completionPerMillion: number
}

export interface UsageSnapshot {
  today: UsageDayBucket
  days: UsageDayBucket[]
  sessions: UsageSessionBucket[]
  pricing: UsagePricing
}
