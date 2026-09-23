import { useEffect, useState, useCallback } from 'react'
import { fetchBase, fetchPaymentsForMonth as apiFetchMonth, fetchPaymentsForTenant as apiFetchTenant } from '../lib/api'
import type { Building, Room, Tenant } from '../lib/types'

type DataState = {
  buildings: Building[]
  rooms: Room[]
  tenants: Tenant[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useBaseData(): DataState {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await fetchBase()
      setBuildings(data.buildings)
      setRooms(data.rooms)
      setTenants(data.tenants)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { buildings, rooms, tenants, loading, error, reload }
}

export const fetchPaymentsForMonth = apiFetchMonth
export const fetchPaymentsForTenant = apiFetchTenant
