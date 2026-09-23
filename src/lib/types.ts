export type Building = {
  id: string
  name: string
  created_at: string
}

export type Room = {
  id: string
  building_id: string
  name: string
  rent: number
  created_at: string
}

export type Tenant = {
  id: string
  room_id: string
  name: string
  phone: string | null
  move_in_date: string
  rent: number
  is_active: boolean
  move_out_date: string | null
  created_at: string
}

export type Payment = {
  id: string
  tenant_id: string
  period_month: string
  paid_date: string
  amount: number
  notes: string | null
  created_at: string
}

export type RoomStatus = 'lunas' | 'belum' | 'terlambat' | 'kosong'
