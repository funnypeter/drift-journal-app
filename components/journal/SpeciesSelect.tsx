'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { SPECIES_BY_CATEGORY } from '@/types'
import styles from './SpeciesSelect.module.css'

interface Props {
  value: string
  onChange: (species: string) => void
}

export default function SpeciesSelect({ value, onChange }: Props) {
  const [inputValue, setInputValue] = useState(value || '')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync input when parent value changes (e.g. AI identification)
  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  // Filter species by input
  const filtered = useMemo(() => {
    const query = inputValue.toLowerCase().trim()
    const groups: { category: string; species: string[] }[] = []
    for (const [category, list] of Object.entries(SPECIES_BY_CATEGORY)) {
      const matches = query
        ? list.filter(s => s.toLowerCase().includes(query))
        : list
      if (matches.length > 0) {
        groups.push({ category, species: matches })
      }
    }
    return groups
  }, [inputValue])

  // Flat list of all visible options for keyboard nav
  const flatOptions = useMemo(
    () => filtered.flatMap(g => g.species),
    [filtered]
  )

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (isOpen) {
          acceptValue(inputValue)
          setIsOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, inputValue])

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownRef.current) return
    const el = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  function acceptValue(val: string) {
    const trimmed = val.trim()
    if (trimmed && trimmed !== value) {
      onChange(trimmed)
    } else if (!trimmed) {
      setInputValue(value || '')
    }
  }

  function selectOption(species: string) {
    setInputValue(species)
    onChange(species)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => (i + 1) % flatOptions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => (i - 1 + flatOptions.length) % flatOptions.length)
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < flatOptions.length) {
          selectOption(flatOptions[highlightedIndex])
        } else {
          acceptValue(inputValue)
          setIsOpen(false)
        }
        break
      case 'Escape':
        e.preventDefault()
        setInputValue(value || '')
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  let optionIndex = 0

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        ref={inputRef}
        className={`${styles.input} ${isOpen ? styles.inputOpen : ''}`}
        type="text"
        value={inputValue}
        placeholder="Search or type species..."
        onChange={e => {
          setInputValue(e.target.value)
          setIsOpen(true)
          setHighlightedIndex(-1)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <svg
        className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="14"
        height="14"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          {filtered.length > 0 ? (
            filtered.map(group => {
              const items = group.species.map(species => {
                const idx = optionIndex++
                return (
                  <button
                    key={species}
                    className={`${styles.option} ${idx === highlightedIndex ? styles.optionHighlighted : ''} ${species === value ? styles.optionSelected : ''}`}
                    data-index={idx}
                    onMouseDown={e => {
                      e.preventDefault()
                      selectOption(species)
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    {species}
                  </button>
                )
              })
              return (
                <div key={group.category}>
                  <div className={styles.categoryHeader}>{group.category}</div>
                  {items}
                </div>
              )
            })
          ) : (
            <div className={styles.noResults}>
              No matches{inputValue.trim() && (
                <> &mdash; press <span className={styles.customHint}>Enter</span> to use &ldquo;{inputValue.trim()}&rdquo;</>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
