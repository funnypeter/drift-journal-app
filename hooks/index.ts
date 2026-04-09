'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Trip, Catch, Profile } from '@/types'

// ── useTrips ──────────────────────────────────────────────────────────────────
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('trips')
      .select('*, catches(*)')
      .order('date', { ascending: false })
    if (error) setError(error.message)
    else setTrips(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const createTrip = async (trip: Partial<Trip>) => {
    const { data, error } = await supabase.from('trips').insert(trip).select().single()
    if (error) throw error
    setTrips(prev => [data, ...prev])
    return data
  }

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    const { data, error } = await supabase.from('trips').update(updates).eq('id', id).select().single()
    if (error) throw error
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    return data
  }

  const deleteTrip = async (id: string) => {
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) throw error
    setTrips(prev => prev.filter(t => t.id !== id))
  }

  return { trips, loading, error, refetch: fetch, createTrip, updateTrip, deleteTrip }
}

// ── useTrip ───────────────────────────────────────────────────────────────────
export function useTrip(id: string) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('trips')
      .select('*, catches(*)')
      .eq('id', id)
      .single()
    if (!error) setTrip(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  const updateCatch = async (catchId: string, updates: Partial<Catch>) => {
    const { data, error } = await supabase
      .from('catches').update(updates).eq('id', catchId).select().single()
    if (error) throw error
    setTrip(prev => prev ? {
      ...prev,
      catches: (prev.catches || []).map(c => c.id === catchId ? { ...c, ...data } : c)
    } : prev)
    return data
  }

  const addCatch = async (c: Partial<Catch>) => {
    const { data, error } = await supabase.from('catches').insert(c).select().single()
    if (error) throw error
    setTrip(prev => prev ? { ...prev, catches: [...(prev.catches || []), data] } : prev)
    return data
  }

  const deleteCatch = async (catchId: string) => {
    const { error } = await supabase.from('catches').delete().eq('id', catchId)
    if (error) throw error
    setTrip(prev => prev ? {
      ...prev,
      catches: (prev.catches || []).filter(c => c.id !== catchId)
    } : prev)
  }

  return { trip, loading, refetch: fetch, updateCatch, addCatch, deleteCatch }
}

// ── useProfile ────────────────────────────────────────────────────────────────
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then((data: Profile) => { if (data && !('error' in data)) setProfile(data) })
      .catch(() => {})
  }, [])

  const updateProfile = async (updates: Partial<Profile>) => {
    const resp = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!resp.ok) throw new Error('Failed to update profile')
    const data = await resp.json()
    setProfile(data)
    return data
  }

  return { profile, updateProfile }
}

// ── useIdentify ───────────────────────────────────────────────────────────────
export function useIdentify() {
  const [loading, setLoading] = useState(false)

  const identify = async (imageBase64: string, mimeType: string, netHoleSize?: number) => {
    setLoading(true)
    try {
      const resp = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, netHoleSize }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || data.error || `Identify failed: ${resp.status}`)
      return data
    } finally {
      setLoading(false)
    }
  }

  return { identify, loading }
}

// ── useConditions ─────────────────────────────────────────────────────────────
export function useConditions() {
  const [loading, setLoading] = useState(false)

  const fetchUSGS = async (params: { siteId?: string; location?: string; lat?: number; lng?: number }) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ type: 'usgs', ...Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      )})
      const resp = await fetch(`/api/conditions?${p}`)
      return await resp.json()
    } finally { setLoading(false) }
  }

  const fetchWeather = async (lat: number, lng: number) => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/conditions?type=weather&lat=${lat}&lng=${lng}`)
      return await resp.json()
    } finally { setLoading(false) }
  }

  return { fetchUSGS, fetchWeather, loading }
}
