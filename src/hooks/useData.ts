import { useCallback, useEffect, useState } from 'react'
import {
  fetchBase,
  fetchPaymentsForMonth as apiFetchMonth,
  fetchPaymentsForTenant as apiFetchTenant,
} from '../lib/api'
import type { Building, Payment, Room, Tenant } from '../lib/types'

export type BaseData = {
  buildings: Building[]
  rooms: Room[]
  tenants: Tenant[]
}

type DataState = BaseData & {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

let cache: BaseData | null = null
let inflight: Promise<BaseData> | null = null

function loadShared(): Promise<BaseData> {
  if (!inflight) {
    inflight = fetchBase().then((data) => {
      cache = data
      return data
    }).finally(() => {
      inflight = null
    })
  }
  return inflight
}

export function useBaseData(): DataState {
  const [state, setState] = useState<BaseData | null>(cache)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await loadShared()
      setState(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!cache) void reload()
  }, [reload])

  return {
    buildings: state?.buildings ?? [],
    rooms: state?.rooms ?? [],
    tenants: state?.tenants ?? [],
    loading: state === null && error === null,
    error,
    reload,
  }
}

export function usePaymentsForMonth(monthKey: string): {
  payments: Payment[]
  loading: boolean
  error: string | null
} {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetchMonth(monthKey)
      .then((data) => {
        if (cancelled) return
        setPayments(data)
        setLoadedMonth(monthKey)
        setError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setLoadedMonth(monthKey)
      })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  return { payments, loading: loadedMonth !== monthKey, error }
}

export function usePaymentsForTenant(tenantId: string | null): {
  payments: Payment[]
  error: string | null
  reload: () => Promise<void>
} {
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!tenantId) {
      setPayments([])
      return
    }
    try {
      setPayments(await apiFetchTenant(tenantId))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [tenantId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { payments, error, reload }
}

export const fetchPaymentsForMonth = apiFetchMonth
export const fetchPaymentsForTenant = apiFetchTenant
